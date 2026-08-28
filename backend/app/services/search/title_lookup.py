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

import difflib
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
    # 20th-century American straight-play canon. Actors audition from these
    # constantly, but they are all post-1928 and copyrighted, so a public-domain
    # corpus holds nothing of them. Being in this dictionary is what lets
    # compute_content_gap answer "I don't carry Death of a Salesman yet" instead
    # of returning 20 unrelated pieces at a middling cosine — the exact confident
    # -wrong failure (H-13) that "death of a salesman" hit (it also mis-classified
    # as an occupation search, since "salesman" is a job). Multi-word only: a
    # single-word title here ("Doubt", "Fences", "Proof") would hijack ordinary
    # searches, and the ones we DO carry already route through the catalogue.
    # _resolve re-checks the catalogue, so a title we later add still reports
    # available_in rather than a false gap.
    "Death of a Salesman": "play",
    "A Raisin in the Sun": "play",
    "Long Day's Journey Into Night": "play",
    "Who's Afraid of Virginia Woolf": "play",
    "Angels in America": "play",
    "True West": "play",
    "The Zoo Story": "play",
    "'night, Mother": "play",
    "A Streetcar Named Desire": "play",
    "The Glass Menagerie": "play",
    "Cat on a Hot Tin Roof": "play",
    "August: Osage County": "play",
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
    # Collapse apostrophes rather than splitting on them, so a contraction folds
    # to one token the way people type it: "Long Day's Journey" and "long days
    # journey" both become "long days journey", and "Who's" == "whos". Applied to
    # query and title alike, so both sides always agree.
    text = text.lower().replace("'", "").replace("’", "")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
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


# Single-token number words folded to their digits. Deliberately no compound
# arithmetic ("twenty one" is left as two tokens, not resolved to 21) — see
# _numeric_key for why that is still enough.
_NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
    "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
    "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17",
    "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70",
    "eighty": "80", "ninety": "90", "hundred": "100", "thousand": "1000",
}


def _numeric_key(value: str) -> str:
    """Space-insensitive title key with number-words folded to digits.

    People swap digits and words freely in a title with a number in it:
    "Brooklyn Nine Nine" is typed "brooklyn 99", "Ocean's Eleven" as
    "ocean's 11", "Eight Mile" as "8 mile". Each number-word token is folded to
    its digits and the spaces are then removed, so either spelling lands on the
    same key ("brooklyn 9 9" and "brooklyn 99" both squash to "brooklyn99").

    Only single-token numbers convert; a compound spelling like "twenty one" is
    left as "20 1" rather than resolved to "21". That is fine on purpose: the
    common miss is one side typing digits, and the stored digit title ("21 Jump
    Street") still matches a digit query. The word spelling of a compound number
    in a title is rare enough not to chase.
    """
    norm = _normalise_title(value)
    return "".join(_NUMBER_WORDS.get(tok, tok) for tok in norm.split())


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


# One-word catalogue titles that are ALSO ordinary descriptive words. When an
# attribute filter is active, a bare one of these most likely means the
# descriptor, not the title ("Awkward" + female = an awkward piece, not the 4
# monologues of the play "Awkward"), so the pre-pass stands down for these and
# lets the vector path serve the attribute search. Everything NOT in this set —
# Hamlet, Macbeth, Fleabag, Euphoria, The Office — is a distinctive title and is
# honoured even under filters, applying those filters to the show's own pieces.
# Derived from the live one-word title list (2026-08-26); safe to tune, a wrong
# call only decides title-pieces vs vector, both non-broken.
_AMBIGUOUS_SINGLE_WORD_TITLES = frozenset({
    "awkward", "happy", "evil", "power", "love", "desire", "shame", "silence",
    "joy", "fury", "doubt", "fresh", "fine", "first", "big", "super",
    "precious", "lost", "buried", "empty", "bound", "wanted", "following",
    "haunting", "betrayal", "denial", "obsession", "respect", "justice",
    "proof", "tradition", "identity", "strife", "substance", "separation",
    "vice", "civil", "father", "queen", "hero", "help", "night", "soul",
})


def prepass_can_honour(filters: Optional[dict], title: str) -> bool:
    """Whether the title pre-pass may answer this search.

    Two independent conditions, for two different failure modes.

    1. Every active filter must be one the pre-pass implements. The original
       version of this guard stood down whenever ANY filter was set, which was
       too blunt: "the night manager" with gender+tone on was the single
       strongest case for the pre-pass — 20 pieces sitting in the library — and
       it fell through to the vector path and came back weak anyway.

    2. When attribute filters are active AND the title is a single word that is
       also an ordinary descriptor (see _AMBIGUOUS_SINGLE_WORD_TITLES), stand
       down: "Awkward" + a gender filter wants an awkward *piece*, and the
       library holds a play called "Awkward". A distinctive one-word title
       ("Hamlet" + male + 20s + <2min) is NOT ambiguous — the actor wants those
       Hamlet pieces, filtered — so it is honoured. This reverses the earlier
       blanket single-word stand-down, which sent every filtered "hamlet" to the
       vector path and returned generic weak matches (2026-08-26 log read).
    """
    filters = filters or {}
    attribute_keys = [k for k in filters if k != "source_type"]
    if any(k not in _PREPASS_SUPPORTED_FILTERS for k in filters):
        return False
    norm = _normalise_title(title)
    if attribute_keys and " " not in norm and norm in _AMBIGUOUS_SINGLE_WORD_TITLES:
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
_catalogue_numeric_cache: Dict[str, tuple] = {}
_catalogue_loaded_at: float = 0.0

# Character-name lookup, sibling to the title catalogue. Naming a CHARACTER is
# also a lookup, not a similarity question: "hamlet" (67 pieces), "joan clarke"
# (4), "anne frank" (1) all sat in the library and came back weak on the vector
# path because a character's name rarely appears in their own dialogue
# (2026-08-27 brief: 27 of 91 weak searches had a direct catalogue match, and
# the misses were dominated by character names the title path can't see).
# normalised name -> (tuple of raw character_name variants, total monologue count)
_character_cache: Optional[Dict[str, tuple]] = None
_character_loaded_at: float = 0.0

# A single-word character name only routes to the character path if it has at
# least this many pieces — a real recurring character (Hamlet, Medea), not a
# one-off first name that would hijack a thematic search.
_MIN_CHAR_SINGLE_WORD_MONOS = 5

# Generic role labels that are character_name values but are NOT what an actor
# means when they type them — "man", "woman", "mother" is an attribute search,
# not a request for the pieces of a character literally named Man. A name whose
# every token is generic stands down and lets the vector path serve it.
_GENERIC_ROLE_WORDS = frozenset({
    "man", "woman", "girl", "boy", "guy", "lady", "kid", "child", "baby",
    "narrator", "chorus", "ensemble", "voice", "voiceover", "announcer",
    "mother", "father", "mom", "dad", "mum", "son", "daughter", "sister",
    "brother", "wife", "husband", "aunt", "uncle", "grandmother", "grandfather",
    "doctor", "nurse", "servant", "maid", "butler", "guard", "soldier",
    "messenger", "king", "queen", "prince", "princess", "waiter", "waitress",
    "teacher", "student", "boss", "manager", "cop", "officer", "priest",
    "stranger", "friend", "neighbor", "neighbour", "young", "old", "first",
    "second", "third", "male", "female", "person", "people", "he", "she", "they",
})


def _load_catalogue(db) -> Dict[str, tuple]:
    """normalised title -> (title, source_type), for plays that have monologues.

    Restricted to plays that HAVE monologues on purpose: 252 of 1,608 play rows
    are empty (duplicate "Hamlet" shells, ingest debris like "test"), and
    promoting one of those would reorder results around nothing.
    """
    global _catalogue_cache, _catalogue_squashed_cache, _catalogue_numeric_cache
    global _catalogue_loaded_at
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
    numeric: Dict[str, tuple] = {}
    collisions: set[str] = set()
    numeric_collisions: set[str] = set()
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
        # Tertiary index: only titles that contain a number, keyed with the
        # number folded to digits so "Brooklyn Nine Nine" is reachable as
        # "brooklyn 99". Same collision-drop discipline as the squashed index.
        k = _numeric_key(title)
        if (
            any(ch.isdigit() for ch in k)
            and len(k) >= _MIN_SQUASHED_CHARS
            and k not in numeric_collisions
        ):
            existing = numeric.get(k)
            if existing is not None and existing[0] != title:
                numeric_collisions.add(k)
                numeric.pop(k, None)
            else:
                numeric[k] = (title, source_type)
    _catalogue_cache = catalogue
    _catalogue_squashed_cache = squashed
    _catalogue_numeric_cache = numeric
    _catalogue_loaded_at = now
    return catalogue


def reset_catalogue_cache() -> None:
    """Drop the cached title + character lists (tests, and after an ingest run)."""
    global _catalogue_cache, _catalogue_squashed_cache, _catalogue_numeric_cache
    global _catalogue_loaded_at, _character_cache, _character_loaded_at
    _catalogue_cache = None
    _catalogue_squashed_cache = {}
    _catalogue_numeric_cache = {}
    _catalogue_loaded_at = 0.0
    _character_cache = None
    _character_loaded_at = 0.0


def _normalise_name(value: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace. Unlike _normalise_title
    this does NOT drop a leading article — names don't carry one, and dropping it
    would fold "A. J." oddly. Kept deliberately simple."""
    v = re.sub(r"[^\w\s]", " ", (value or "").lower())
    return re.sub(r"\s+", " ", v).strip()


def _is_generic_name(norm: str) -> bool:
    """True when every token is a generic role word, so the name is really an
    attribute ("young woman", "old man") rather than a specific character."""
    toks = norm.split()
    return bool(toks) and all(t in _GENERIC_ROLE_WORDS for t in toks)


def _load_character_catalogue(db) -> Dict[str, tuple]:
    """normalised character name -> (raw variants tuple, total monologue count).

    Grouped by the raw stored value so retrieval can hit the
    ix_monologues_character_name btree with an IN list instead of a functional
    scan. Cached like the title catalogue: rebuilt only when an ingest runs.
    """
    global _character_cache, _character_loaded_at
    now = time.time()
    if _character_cache is not None and now - _character_loaded_at < _CATALOGUE_TTL_SECONDS:
        return _character_cache
    from sqlalchemy import text as sa_text

    rows = db.execute(
        sa_text(
            "SELECT character_name, count(*) FROM monologues "
            "WHERE character_name IS NOT NULL AND length(trim(character_name)) >= 3 "
            "GROUP BY character_name"
        )
    ).fetchall()
    cat: Dict[str, tuple] = {}
    for raw, cnt in rows:
        n = _normalise_name(raw)
        if len(n) < _MIN_TITLE_CHARS:
            continue
        variants, total = cat.get(n, ((), 0))
        cat[n] = (variants + (raw,), total + int(cnt))
    _character_cache = cat
    _character_loaded_at = now
    return cat


def detect_catalogue_character(db, query: str) -> Optional[Dict[str, object]]:
    """Return {"character", "names": [...]} when the whole query names a catalogue
    character. Conservative on purpose, mirroring the title path:

    - the trimmed query must EQUAL a character name, not merely contain one
      (so "hamlet" hits, but "a monologue about hamlet's grief" does not);
    - multi-word full names ("joan clarke") are always eligible — they are
      inherently a lookup;
    - a single-word name must be distinctive: not a generic role word, not one of
      the ambiguous descriptor words, and carried on enough pieces to be a real
      recurring character (>= _MIN_CHAR_SINGLE_WORD_MONOS).

    Never raises: a failed load degrades to "no character detected".
    """
    if db is None or not query:
        return None
    nq = _normalise_name(query)
    if len(nq) < _MIN_TITLE_CHARS:
        return None
    try:
        cat = _load_character_catalogue(db)
    except Exception:
        return None

    stripped = " ".join(w for w in nq.split() if w not in _TITLE_FILLER).strip()
    for cand in (nq, stripped):
        if not cand:
            continue
        entry = cat.get(cand)
        if entry is None:
            continue
        if _is_generic_name(cand):
            continue
        variants, count = entry
        toks = cand.split()
        if len(toks) == 1:
            if cand in _AMBIGUOUS_SINGLE_WORD_TITLES:
                continue
            if count < _MIN_CHAR_SINGLE_WORD_MONOS:
                continue
        return {"character": cand, "names": list(variants)}
    return None


def find_character_monologues(db, names: list, filters: Optional[dict] = None,
                              limit: int = 20) -> list:
    """Monologues whose character is `names` (the raw variants of one normalised
    name), best-first. The character sibling of find_title_monologues: same
    filter cascade, same review gate, same quality ordering. Empty on anything
    it cannot honour, so the caller falls through to the vector path unbroken.
    """
    if db is None or not names:
        return []
    filters = filters or {}
    # Reuse the title guard's filter-support check (the ambiguous-single-word
    # arm keys off the title text and is a no-op here).
    if any(k not in _PREPASS_SUPPORTED_FILTERS for k in filters):
        return []

    from sqlalchemy import or_ as sa_or
    from sqlalchemy.orm import joinedload, undefer

    from app.models.actor import Monologue, Play
    from app.services.search.semantic_search import (_age_hard_values,
                                                     review_hides_from_search)

    try:
        q = (
            db.query(Monologue)
            .options(joinedload(Monologue.play), undefer(Monologue.review_status))
            .filter(Monologue.character_name.in_(names))
        )

        source_type = filters.get("source_type")
        if source_type:
            st = source_type if isinstance(source_type, list) else [source_type]
            st = [s for s in st if s]
            if st:
                q = q.join(Play).filter(
                    func_coalesce_source_type(Play).in_(st)
                )
        if filters.get("gender"):
            q = q.filter(
                Monologue.character_gender.in_([filters["gender"], "any", "either gender"])
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
            q = q.filter(Monologue.estimated_duration_seconds <= filters["max_duration"])
        if filters.get("min_duration"):
            q = q.filter(Monologue.estimated_duration_seconds >= filters["min_duration"])
        if filters.get("act"):
            q = q.filter(Monologue.act == filters["act"])
        if filters.get("scene"):
            q = q.filter(Monologue.scene == filters["scene"])
        if filters.get("max_overdone_score") is not None:
            threshold = float(filters["max_overdone_score"])
            q = q.filter(
                sa_or(Monologue.overdone_score.is_(None), Monologue.overdone_score <= threshold)
            )
        rows = q.all()
    except Exception:
        return []

    keep = [m for m in rows if not review_hides_from_search(m.review_status)]
    keep.sort(
        key=lambda m: (-(m.quality_score if m.quality_score is not None else -1.0), m.id)
    )
    return keep[:limit]


def func_coalesce_source_type(play_model):
    """COALESCE(Play.source_type, 'play') as a SQLAlchemy expression."""
    from sqlalchemy import func
    return func.coalesce(play_model.source_type, "play")


# Abbreviations and acronyms actors type instead of the full title. This is the
# "let AI understand it" layer, done as a static map on purpose: an LLM call on
# the hot path of every title search costs money and ~1s of latency (the exact
# OpenAI/egress cost we spend the rest of search avoiding), and the moment an
# abbreviation is known once it never needs re-deriving. Keyed and valued in the
# _normalise_title space (lowercase, no punctuation, no leading article). Only
# TITLE abbreviations belong here — a person's initials ("srk") is an
# actor/character lookup, not a title, and would never resolve on this path.
# When an entry's expansion is a title we do NOT carry, expanding still helps:
# it routes the query to an honest content-gap answer faster than the vector
# tail would. Extend freely as new abbreviations show up in the weak-match logs.
_TITLE_ALIASES: Dict[str, str] = {
    "tfios": "the fault in our stars",
    "lotr": "the lord of the rings",
    "hsm": "high school musical",
    "himym": "how i met your mother",
    "gwtw": "gone with the wind",
    "rhps": "the rocky horror picture show",
    "ftw": "freedom writers",
    "ddlj": "dilwale dulhania le jayenge",
    "k3g": "kabhi khushi kabhie gham",
}


def _expand_title_alias(nq: str) -> str:
    """Expand a whole-query abbreviation to its full title, else return nq.

    Only the entire normalised query is matched against the alias table — an
    abbreviation buried inside a longer phrase is left alone, so this can never
    quietly rewrite an ordinary search that happens to contain "hsm".
    """
    return _TITLE_ALIASES.get(nq, nq)


# A fuzzy match must clear this token-level similarity to be trusted for a typo.
# High on purpose: this branch runs only after every exact form has failed, and
# a loose threshold here is how an attribute search gets hijacked by a title.
_FUZZY_TYPO_RATIO = 0.9

# The shortest normalised query the fuzzy branch will touch. Below this, partial
# and typo matching is too collision-prone to be worth the false promotes.
_MIN_FUZZY_CHARS = 6


def _fuzzy_catalogue_match(nq: str, catalogue: Dict[str, tuple]) -> Optional[Dict[str, str]]:
    """Partial / reordered / single-typo match over the in-memory catalogue.

    The exact, squashed, numeric and phrase stages all match a title the actor
    typed *whole and in order*. The remaining weak-match class is titles typed
    as a PREFIX or FRAGMENT of a longer stored title ("sweeney todd" for
    "Sweeney Todd: The Demon Barber of Fleet Street") or with the words REORDERED
    ("corey taylor finding" for "Finding Corey Taylor"). find_title_monologues
    matches the stored title exactly, so the value of this branch is that it
    returns the CANONICAL stored title, which then retrieves cleanly.

    Ground-truth only: every candidate is a real catalogue key, so a hit is
    always a title we carry. Heavily guarded — multi-word queries only, a length
    floor, and every tier requires exactly ONE distinct title to qualify, so an
    ambiguous fragment stands down to the vector path rather than guessing.
    """
    q_tokens = [t for t in nq.split() if t not in _TITLE_FILLER]
    # Single words are far too collision-prone here ("Big", "It", "Up" are real
    # one-word titles); leave them to the exact stages and the phrase guard.
    if len(q_tokens) < 2:
        return None
    q_norm = " ".join(q_tokens)
    if len(q_norm) < _MIN_FUZZY_CHARS:
        return None
    q_set = set(q_tokens)

    prefix_hits: list = []    # stored title starts with the typed phrase
    reorder_hits: list = []   # same set of words, any order (whole title)
    contig_hits: list = []    # typed phrase is a contiguous run inside the title
    typo_hits: list = []      # same token count, one/two letters off
    for key, (title, medium) in catalogue.items():
        if key == q_norm:
            continue                       # exact form handled upstream
        k_tokens = key.split()
        if key.startswith(q_norm + " "):
            prefix_hits.append((title, medium))
            continue
        if len(k_tokens) == len(q_tokens):
            if set(k_tokens) == q_set:
                reorder_hits.append((title, medium))
                continue
            if difflib.SequenceMatcher(None, q_norm, key).ratio() >= _FUZZY_TYPO_RATIO:
                typo_hits.append((title, medium))
                continue
        if q_set <= set(k_tokens) and f" {q_norm} " in f" {key} ":
            contig_hits.append((title, medium))

    # Strongest evidence first. A tier only fires when a single distinct title
    # qualifies; two different titles matching equally well is ambiguous and
    # must not be resolved by arbitrary dict order.
    for hits in (reorder_hits, prefix_hits, typo_hits, contig_hits):
        if hits and len({h[0] for h in hits}) == 1:
            title, medium = hits[0]
            return {"title": title, "medium": medium}
    return None


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
    # Expand a known abbreviation ("tfios" -> "the fault in our stars") before
    # any matching, then re-normalise so the leading article is dropped again.
    nq = _normalise_title(_expand_title_alias(nq))
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

    # Number-insensitive fallback: "brooklyn 99" -> "brooklyn99" -> the stored
    # "Brooklyn Nine Nine" (whose key is also "brooklyn99"). Only fires when the
    # query itself carries a number, so it never touches ordinary lookups.
    for candidate in (nq, stripped):
        k = _numeric_key(candidate)
        if (
            any(ch.isdigit() for ch in k)
            and len(k) >= _MIN_SQUASHED_CHARS
            and k in _catalogue_numeric_cache
        ):
            title, medium = _catalogue_numeric_cache[k]
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

    # Last resort: partial / reordered / single-typo match, which resolves to the
    # canonical stored title so find_title_monologues can match it exactly. Run
    # against the filler-stripped form too ("sweeney todd monologue").
    for candidate in (nq, stripped):
        hit = _fuzzy_catalogue_match(candidate, catalogue)
        if hit:
            return hit
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
