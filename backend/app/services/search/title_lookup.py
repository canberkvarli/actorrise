"""Named show/title lookup detection for search queries.

The 2026-07 prod-log audit showed ~15% of searches name the show the actor is
auditioning for ("Bridgerton", "the witch in into the woods", "professor plum
in clue!"). The AI intended-play extraction almost never catches these (0
content_gap fires in 60 days), so the user gets 20 loosely-related results
with no acknowledgment the title isn't carried.

detect_title_lookup() matches a curated dictionary of titles actors commonly
audition for. It's deliberately conservative: multi-word titles match as
phrases; single-word titles must be distinctive (no "clue", "six", "office" —
those enter via character/phrase aliases only).

compute_content_gap() is the single source of truth for content-gap
resolution, shared by the search endpoint and scripts/run_golden_search.py.
"""

from __future__ import annotations

import re
from typing import Dict, Iterable, Optional

# Canonical title -> medium. Membership in the library is NOT considered here;
# compute_content_gap() suppresses the gap when the results contain the title.
KNOWN_TITLES: Dict[str, str] = {
    # Musicals actors audition for (mostly not licensable as library text)
    "Into the Woods": "musical",
    "Dear Evan Hansen": "musical",
    "Mean Girls": "musical",
    "Heathers": "musical",
    "Beetlejuice": "musical",
    "Matilda": "musical",
    "Hamilton": "musical",
    "Wicked": "musical",
    "Hadestown": "musical",
    "Waitress": "musical",
    "Newsies": "musical",
    "Sweeney Todd": "musical",
    "Little Shop of Horrors": "musical",
    "Legally Blonde": "musical",
    "West Side Story": "musical",
    "Les Miserables": "musical",
    "Phantom of the Opera": "musical",
    "Mamma Mia": "musical",
    "High School Musical": "musical",
    "Be More Chill": "musical",
    "Shrek the Musical": "musical",
    "Sound of Music": "musical",
    # TV
    "Bridgerton": "tv",
    "Breaking Bad": "tv",
    "Stranger Things": "tv",
    "Euphoria": "tv",
    "Fleabag": "tv",
    "Succession": "tv",
    "Gossip Girl": "tv",
    "Outer Banks": "tv",
    "Riverdale": "tv",
    "Peaky Blinders": "tv",
    "Killing Eve": "tv",
    "Normal People": "tv",
    "Sex Education": "tv",
    "Derry Girls": "tv",
    "Ted Lasso": "tv",
    "Yellowjackets": "tv",
    "Ghosts": "tv",
    # Film
    "Clueless": "film",
    "Clue": "film",
    "Gone Girl": "film",
    "Lady Bird": "film",
    "Booksmart": "film",
    "Juno": "film",
    "Twilight": "film",
    "The Hunger Games": "film",
    "Harry Potter": "film",
    "Spider-Man": "film",
    "Pitch Perfect": "film",
    "10 Things I Hate About You": "film",
    "The Perks of Being a Wallflower": "film",
    "Good Will Hunting": "film",
    "Dead Poets Society": "film",
    "La La Land": "film",
    "One Flew Over the Cuckoo's Nest": "film",
    # Contemporary plays (in copyright, commonly audition-searched)
    "Girls Like That": "play",
    "The Wolves": "play",
    "She Kills Monsters": "play",
    "Almost, Maine": "play",
    "Puffs": "play",
    "Radium Girls": "play",
    "The Crucible": "play",
    "Our Town": "play",
}

# Phrases that imply a title without naming it verbatim (characters, alt names).
# All keys lowercase, punctuation-free.
TITLE_ALIASES: Dict[str, str] = {
    "professor plum": "Clue",
    "cady heron": "Mean Girls",
    "regina george": "Mean Girls",
    "cher horowitz": "Clueless",
    "evan hansen": "Dear Evan Hansen",
    "veronica sawyer": "Heathers",
    "elphaba": "Wicked",
    "walter white": "Breaking Bad",
    "katniss": "The Hunger Games",
    "nurse ratched": "One Flew Over the Cuckoo's Nest",
    "nurse ratchet": "One Flew Over the Cuckoo's Nest",
    "alison cooper": "Ghosts",
    "ghosts uk": "Ghosts",
    "wednesday addams": "Wednesday",
    "spiderman": "Spider-Man",
    "spider man": "Spider-Man",
    "les mis": "Les Miserables",
    "mean girls jr": "Mean Girls",
    "frozen jr": "Frozen",
}

# Single words distinctive enough to match as a lone token. Anything ambiguous
# ("clue", "six", "ghosts", "frozen", "wednesday", "annie", "chicago") is
# reachable only through a multi-word phrase or alias above.
_SAFE_SINGLE_WORDS = {
    "bridgerton", "beetlejuice", "matilda", "clueless", "heathers", "euphoria",
    "fleabag", "succession", "riverdale", "hamilton", "hadestown", "waitress",
    "newsies", "juno", "booksmart", "twilight", "yellowjackets", "puffs",
    "elphaba", "katniss", "spiderman", "wicked",
}


def _normalize(text: str) -> str:
    text = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def detect_title_lookup(query: str) -> Optional[Dict[str, str]]:
    """Return {"title", "medium"} when the query names a known show/title."""
    if not query:
        return None
    q = _normalize(query)
    if not q:
        return None
    padded = f" {q} "

    # Aliases first: they're the most specific signal (character names).
    for alias, title in TITLE_ALIASES.items():
        if f" {alias} " in padded:
            return {"title": title, "medium": KNOWN_TITLES.get(title, "tv")}

    tokens = set(q.split())
    best: Optional[str] = None
    for title in KNOWN_TITLES:
        t = _normalize(title)
        if " " in t:
            if f" {t} " in padded and (best is None or len(t) > len(_normalize(best))):
                best = title
        elif t in tokens and t in _SAFE_SINGLE_WORDS:
            if best is None or len(t) > len(_normalize(best)):
                best = title
    if best:
        return {"title": best, "medium": KNOWN_TITLES[best]}
    return None


def promote_title_matches(title: str, results_with_scores: list) -> list:
    """Stable-move monologues whose play title matches `title` to the front.

    Used when the query names a show the library carries: semantic ranking can
    bury the literal title matches under thematically-similar pieces (golden
    known-fail: 'Cady Heron in mean girls jr' left the four real Mean Girls
    monologues below the top 5). Scores and relative order are preserved; when
    nothing matches this is a no-op.
    """
    needle = (title or "").lower()
    if not needle:
        return results_with_scores
    hits, rest = [], []
    for m, score in results_with_scores:
        play = getattr(m, "play", None)
        play_title = (getattr(play, "title", "") or "") if play else ""
        (hits if needle in play_title.lower() else rest).append((m, score))
    return hits + rest if hits else results_with_scores


def compute_content_gap(
    query: str,
    intended_play: Optional[str],
    intended_author: Optional[str],
    result_play_titles: Iterable[str],
    result_authors: Iterable[str] = (),
) -> Optional[dict]:
    """Resolve the content_gap for a search response.

    Prefers the AI-extracted intended play/author; falls back to the curated
    title dictionary. Returns None whenever the results already contain the
    requested play or author (no gap to report).
    """
    titles_lower = [(t or "").lower() for t in result_play_titles]
    authors_lower = [(a or "").lower() for a in result_authors]

    if intended_play or intended_author:
        if intended_play and any(intended_play.lower() in t for t in titles_lower):
            return None
        if intended_author and any(intended_author.lower() in a for a in authors_lower):
            return None
        return {"play": intended_play, "author": intended_author}

    hit = detect_title_lookup(query)
    if hit and not any(hit["title"].lower() in t for t in titles_lower):
        return {"play": hit["title"], "author": None}
    return None
