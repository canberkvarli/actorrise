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
import time
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


def _normalise_title(value: str) -> str:
    """Lowercase, strip punctuation, drop a leading article.

    Stored titles do not match how people type them ("The Queens Gambit" vs
    "Queen's gambit", "Fantastic Mr. Fox" vs "fantastic mr fox").

    Spaces are PRESERVED — the phrase matching in detect_catalogue_title needs
    word boundaries to tell a title inside a sentence from a coincidental run
    of letters. Use _squash_title for the space-insensitive comparison.
    """
    v = re.sub(r"[^\w\s]", "", (value or "").lower())
    v = re.sub(r"\s+", " ", v).strip()
    return re.sub(r"^(the|a|an)\s+", "", v).strip()


# Below this a squashed key is too collision-prone to trust.
_MIN_SQUASHED_CHARS = 5


def _squash_title(value: str) -> str:
    """_normalise_title with the spaces removed as well.

    People do not agree with a catalogue about where the space goes in a title
    that mixes letters and digits. The library stores "Pen15"; an actor types
    "Pen 15", which normalises to "pen 15", matches nothing, and gets told we
    have never heard of a show we hold 3 monologues from. Same shape as
    "Se7en" or "Ocean's 11".

    Only ever used as a FALLBACK after the spaced forms fail, and only at
    >= _MIN_SQUASHED_CHARS, so it cannot quietly rewrite a normal lookup.
    """
    return _normalise_title(value).replace(" ", "")


def find_catalogue_source_types(db, title: str) -> list[str]:
    """source_types under which `title` actually exists, normalised both sides.

    Empty list means we genuinely do not carry it.
    """
    if db is None or not title:
        return []
    norm = _normalise_title(title)
    if len(norm) < 3:
        return []
    from sqlalchemy import text as sa_text

    # Normalise in SQL rather than pulling all 1,608 play titles per lookup.
    expr = "regexp_replace(lower(p.title), '[^\\w\\s]', '', 'g')"
    expr = f"regexp_replace({expr}, '^(the|a|an)\\s+', '')"
    # A play row with no monologues is not something we carry. 252 of 1,608
    # rows are empty shells (duplicate "Hamlet" rows, ingest debris like
    # "test"), and counting them made this claim we had a title when we held
    # nothing of it: searching Beetlejuice suppressed the content-gap banner
    # and the request CTA, while the library had zero Beetlejuice pieces.
    # NOTE the parentheses around the OR — without them the EXISTS would bind
    # to the second branch only.
    # Space-insensitive form, so "Pen 15" finds the stored "Pen15". Guarded by
    # length on both sides for the same reason _squash_title is: a short
    # squashed key collides too easily to be trusted.
    squashed = norm.replace(" ", "")
    sq_expr = f"replace({expr}, ' ', '')"
    rows = db.execute(
        sa_text(
            f"SELECT DISTINCT COALESCE(p.source_type, 'play') st FROM plays p "
            f"WHERE ({expr} = :n "
            f"      OR (length({expr}) >= 4 AND :n LIKE '%' || {expr} || '%') "
            f"      OR (length(:sq) >= {_MIN_SQUASHED_CHARS} AND {sq_expr} = :sq)) "
            f"AND EXISTS (SELECT 1 FROM monologues m WHERE m.play_id = p.id)"
        ),
        {"n": norm, "sq": squashed},
    ).fetchall()
    return sorted(r[0] for r in rows)


# Filters find_title_monologues applies itself, predicate-for-predicate against
# SemanticSearch.search's hard-filter cascade. Anything outside this set means
# the pre-pass cannot faithfully honour what the actor asked for, so it stands
# down and the vector path serves the query. Deliberately excluded:
# category/era (Play.category plus era_year_clause, not a plain predicate),
# theme/themes (array containment), author/exclude_author/exclude_play and
# character_name (ilike against a column the title match already pins down).
_PREPASS_SUPPORTED_FILTERS = {
    "source_type", "gender", "age_range", "emotion", "tone", "difficulty",
    "max_duration", "min_duration", "act", "scene", "max_overdone_score",
}


def prepass_can_honour(filters: Optional[dict], title: str) -> bool:
    """Whether the title pre-pass may answer this search.

    Two independent conditions, for two different failure modes.

    1. Every active filter must be one the pre-pass implements. The original
       version of this guard stood down whenever ANY filter was set, which was
       too blunt: "the night manager" with gender+tone on was the single
       strongest case for the pre-pass — 20 pieces sitting in the library — and
       it fell through to the vector path and came back weak anyway.

    2. When attribute filters ARE active, the title must be multi-word. The
       library holds one-word titles that are also ordinary descriptive words:
       an actor searching "Awkward" with a gender filter wants an awkward
       *piece*, and the library has a title called "Awkward" with 4 monologues.
       Answering that as a title lookup would hijack the search. With no
       filters the query is bare and naming the title is the likeliest intent,
       so single words are allowed through as before.
    """
    filters = filters or {}
    attribute_keys = [k for k in filters if k != "source_type"]
    if any(k not in _PREPASS_SUPPORTED_FILTERS for k in filters):
        return False
    if attribute_keys and " " not in _normalise_title(title):
        return False
    return True


def find_title_monologues(db, title: str, filters: Optional[dict] = None,
                          limit: int = 20) -> list:
    """The monologues of `title`, best-first. Empty list when we carry none.

    This is the pre-pass behind ``match_strategy="title_exact"``. The 2026-08-20
    read found 13 of 41 weak matches in a week were searches for shows the
    library already holds — "the night manager" (39 pieces), "fleabag" (6),
    "bottoms" (4), "newsies" (4) all came back weak, because semantic ranking
    scores a bare title against monologue *text* and a show's name rarely
    appears in its own dialogue. Naming a show is a lookup, not a similarity
    question, so it should not be answered with a vector query at all.

    Ordered by quality_score desc (nulls last, then id for a stable page):
    once the actor has named the show, the only ranking question left is which
    of its pieces is the best piece.

    Matching is exact on the normalised title, both sides — lowercase, strip
    punctuation, drop a leading article, collapse whitespace. pg_trgm is not
    installed on this project, so there is deliberately no fuzzy branch; near
    misses fall through to the vector path exactly as they do today.

    Named-title searches bypass the film/TV word gate on purpose (2026-08-17:
    that gate hid 162 of 355 TV titles from lookup by name). Pieces held back
    for review are still excluded — those are not shippable to anyone.
    """
    if db is None or not title:
        return []
    norm = _normalise_title(title)
    if len(norm) < _MIN_TITLE_CHARS:
        return []

    filters = filters or {}
    if not prepass_can_honour(filters, title):
        return []

    from sqlalchemy import or_ as sa_or
    from sqlalchemy import text as sa_text
    from sqlalchemy.orm import joinedload, undefer

    from app.models.actor import Monologue
    from app.services.search.semantic_search import (_age_hard_values,
                                                     review_hides_from_search)

    expr = "regexp_replace(lower(p.title), '[^\\w\\s]', '', 'g')"
    expr = f"regexp_replace({expr}, '^(the|a|an)\\s+', '')"
    sql = f"SELECT p.id FROM plays p WHERE {expr} = :n"
    params: Dict[str, object] = {"n": norm}
    # source_type narrows which play rows count, so it is applied here rather
    # than against the monologues.
    source_type = filters.get("source_type")
    if source_type:
        st = source_type if isinstance(source_type, list) else [source_type]
        st = [s for s in st if s]
        if st:
            sql += " AND COALESCE(p.source_type, 'play') = ANY(:st)"
            params["st"] = st

    try:
        play_ids = [r[0] for r in db.execute(sa_text(sql), params).fetchall()]
        if not play_ids:
            return []
        q = (
            db.query(Monologue)
            # review_status is a deferred column; undefer it so the gate below
            # costs no extra round trip per row.
            .options(joinedload(Monologue.play), undefer(Monologue.review_status))
            .filter(Monologue.play_id.in_(play_ids))
        )

        # Every predicate below mirrors SemanticSearch.search's hard-filter
        # cascade exactly. Keep them identical: the guard above guarantees we
        # only reach here for filters this block implements, so a change there
        # without a change here silently returns the wrong pieces.
        if filters.get("gender"):
            # Gender-neutral pieces count as a match, same as the cascade.
            q = q.filter(
                Monologue.character_gender.in_(
                    [filters["gender"], "any", "either gender"]
                )
            )
        if filters.get("age_range"):
            q = q.filter(
                Monologue.character_age_range.in_(_age_hard_values(filters["age_range"]))
            )
        if filters.get("emotion"):
            q = q.filter(Monologue.primary_emotion == filters["emotion"])
        if filters.get("tone"):
            q = q.filter(Monologue.tone == filters["tone"])
        if filters.get("difficulty"):
            q = q.filter(Monologue.difficulty_level == filters["difficulty"])
        if filters.get("max_duration"):
            q = q.filter(
                Monologue.estimated_duration_seconds <= filters["max_duration"]
            )
        if filters.get("min_duration"):
            q = q.filter(
                Monologue.estimated_duration_seconds >= filters["min_duration"]
            )
        if filters.get("act"):
            q = q.filter(Monologue.act == filters["act"])
        if filters.get("scene"):
            q = q.filter(Monologue.scene == filters["scene"])
        if filters.get("max_overdone_score") is not None:
            threshold = float(filters["max_overdone_score"])
            q = q.filter(
                sa_or(
                    Monologue.overdone_score.is_(None),
                    Monologue.overdone_score <= threshold,
                )
            )

        rows = q.all()
    except Exception:
        # A failed pre-pass must degrade to the normal vector path, never to a
        # broken search.
        return []

    keep = [m for m in rows if not review_hides_from_search(m.review_status)]
    keep.sort(
        key=lambda m: (
            -(m.quality_score if m.quality_score is not None else -1.0),
            m.id,
        )
    )
    return keep[:limit]


# Words that surround a title without being part of one. Stripped so "the
# office monologue" still matches the stored title "The Office".
_TITLE_FILLER = {
    "monologue", "monologues", "audition", "auditioning", "auditions", "scene",
    "scenes", "from", "in", "for", "the", "a", "an", "piece", "speech",
    "play", "show", "film", "movie", "series", "tv", "musical", "my", "me",
}

# A title may only be matched as a phrase *inside* a longer query when it is
# multi-word and this long. Single-word titles are matched only when they are
# essentially the whole query. Without this, the library's one-word titles
# ("Big", "Audition", "The", "It", "Up") hijack ordinary attribute searches —
# "funny audition monologue" would promote the film *Audition*.
_MIN_PHRASE_TITLE_CHARS = 8
_MIN_TITLE_CHARS = 3


# The catalogue is ~1,200 titles and changes only when an ingest job runs, but
# matching it in SQL costs a seq scan plus a Supabase round trip — measured at
# ~340 ms, which is not something to add to every single search. So it is
# loaded once per process and refreshed on a timer.
# Six hours: the title list only changes when an ingest job runs, and a short
# TTL just means more actors paying the reload.
_CATALOGUE_TTL_SECONDS = 6 * 3600
_catalogue_cache: Optional[Dict[str, tuple]] = None
_catalogue_squashed_cache: Dict[str, tuple] = {}
_catalogue_loaded_at: float = 0.0


def _load_catalogue(db) -> Dict[str, tuple]:
    """normalised title -> (title, source_type), for plays that have monologues.

    Restricted to plays that HAVE monologues on purpose: 252 of 1,608 play rows
    are empty (duplicate "Hamlet" shells, ingest debris like "test"), and
    promoting one of those would reorder results around nothing.
    """
    global _catalogue_cache, _catalogue_squashed_cache, _catalogue_loaded_at
    now = time.time()
    if _catalogue_cache is not None and now - _catalogue_loaded_at < _CATALOGUE_TTL_SECONDS:
        return _catalogue_cache
    from sqlalchemy import text as sa_text

    rows = db.execute(
        sa_text(
            "SELECT DISTINCT p.title, COALESCE(p.source_type, 'play') "
            "FROM plays p WHERE EXISTS "
            "(SELECT 1 FROM monologues m WHERE m.play_id = p.id)"
        )
    ).fetchall()
    catalogue: Dict[str, tuple] = {}
    squashed: Dict[str, tuple] = {}
    collisions: set[str] = set()
    for title, source_type in rows:
        n = _normalise_title(title)
        if len(n) >= _MIN_TITLE_CHARS and n not in catalogue:
            catalogue[n] = (title, source_type)
        # Secondary, space-insensitive index. A key that two different titles
        # squash onto is dropped entirely rather than resolved arbitrarily.
        s = _squash_title(title)
        if len(s) >= _MIN_SQUASHED_CHARS and s not in collisions:
            existing = squashed.get(s)
            if existing is not None and existing[0] != title:
                collisions.add(s)
                squashed.pop(s, None)
            else:
                squashed[s] = (title, source_type)
    _catalogue_cache = catalogue
    _catalogue_squashed_cache = squashed
    _catalogue_loaded_at = now
    return catalogue


def reset_catalogue_cache() -> None:
    """Drop the cached title list (tests, and after an ingest run)."""
    global _catalogue_cache, _catalogue_squashed_cache, _catalogue_loaded_at
    _catalogue_cache = None
    _catalogue_squashed_cache = {}
    _catalogue_loaded_at = 0.0


def detect_catalogue_title(db, query: str) -> Optional[Dict[str, str]]:
    """Return {"title", "medium"} when the query names a title we actually carry.

    detect_title_lookup() only knows the curated dictionary, so titles the
    library really holds went undetected: "queen's gambit" scored 0.307 against
    Hamlet and never promoted the five Queen's Gambit pieces sitting in the DB.
    This matches the query against real `plays.title` values instead.

    Never raises: a failed catalogue load must degrade to "no title detected",
    not break the search.
    """
    if db is None or not query:
        return None
    nq = _normalise_title(query)
    if len(nq) < _MIN_TITLE_CHARS:
        return None
    try:
        catalogue = _load_catalogue(db)
    except Exception:
        return None

    stripped = " ".join(w for w in nq.split() if w not in _TITLE_FILLER).strip()
    for candidate in (nq, stripped):
        if candidate and candidate in catalogue:
            title, medium = catalogue[candidate]
            return {"title": title, "medium": medium}

    # Space-insensitive fallback, after every spaced form has failed: "Pen 15"
    # -> "pen15" -> the stored "Pen15".
    for candidate in (nq, stripped):
        s = candidate.replace(" ", "")
        if len(s) >= _MIN_SQUASHED_CHARS and s in _catalogue_squashed_cache:
            title, medium = _catalogue_squashed_cache[s]
            return {"title": title, "medium": medium}

    # Phrase match: only multi-word titles of real length, longest wins.
    padded = f" {nq} "
    best_norm: Optional[str] = None
    for n in catalogue:
        if len(n) < _MIN_PHRASE_TITLE_CHARS or " " not in n:
            continue
        if f" {n} " in padded and (best_norm is None or len(n) > len(best_norm)):
            best_norm = n
    if best_norm:
        title, medium = catalogue[best_norm]
        return {"title": title, "medium": medium}
    return None


def compute_content_gap(
    query: str,
    intended_play: Optional[str],
    intended_author: Optional[str],
    result_play_titles: Iterable[str],
    result_authors: Iterable[str] = (),
    db=None,
    applied_source_type=None,
) -> Optional[dict]:
    """Resolve the content_gap for a search response.

    Prefers the AI-extracted intended play/author; falls back to the curated
    title dictionary. Returns None whenever the results already contain the
    requested play or author (no gap to report).

    CRITICAL: absence from the RESULTS is not absence from the LIBRARY. Searching
    "fleabag" on the Plays tab filtered out all 6 Fleabag monologues (they are
    source_type "tv"), and this function then told the actor "We don't have
    Fleabag in our library yet" and offered to request it. It was there the whole
    time. So when a title does exist under some other source_type we report
    `available_in` instead of a gap, and the UI offers to switch tabs rather than
    denying the thing exists.
    """
    titles_lower = [(t or "").lower() for t in result_play_titles]
    authors_lower = [(a or "").lower() for a in result_authors]

    def _resolve(title: Optional[str], author: Optional[str]) -> Optional[dict]:
        if not title:
            return {"play": title, "author": author}
        available = find_catalogue_source_types(db, title)
        if not available:
            return {"play": title, "author": author}
        # We have it. If a source_type filter is what hid it, say so.
        applied = applied_source_type
        applied_list = (
            [applied] if isinstance(applied, str) else list(applied or [])
        )
        elsewhere = [st for st in available if st not in applied_list]
        if applied_list and elsewhere:
            return {
                "play": title,
                "author": author,
                "available_in": elsewhere,
            }
        # We carry it and no filter explains the miss: not a content gap, and
        # claiming otherwise would be a plain falsehood.
        return None

    if intended_play or intended_author:
        if intended_play and any(intended_play.lower() in t for t in titles_lower):
            return None
        if intended_author and any(intended_author.lower() in a for a in authors_lower):
            return None
        return _resolve(intended_play, intended_author)

    # Curated dictionary first (it covers titles we do NOT carry, which is the
    # only way a real gap gets reported), then the catalogue. The catalogue arm
    # lets a carried title that a tab filter hid report `available_in` — e.g.
    # "queen's gambit" on the Plays tab now offers Film & TV instead of 20
    # unrelated plays.
    hit = detect_title_lookup(query) or detect_catalogue_title(db, query)
    if hit and not any(hit["title"].lower() in t for t in titles_lower):
        return _resolve(hit["title"], None)
    return None
