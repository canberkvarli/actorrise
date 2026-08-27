"""Classify what KIND of thing a search query is asking for.

The August outreach brief could not answer a basic question: are actors
arriving and typing a show name they were cast in, or browsing by attribute
("dramatic female 20s")? Those are different products. `search_logs.query`
holds the raw text but nothing aggregates it, and eyeballing 10k rows is not
analysis.

This is deliberately a rules classifier, not an AI call: it runs on the logging
path of every search, so it must be free and never able to fail a request. It
is also LOG-ONLY — nothing here feeds ranking, filtering, or the response, so a
misclassification costs an analytics row, not a result set.

Categories (stored in search_logs.query_type):
    title         names a show/play/film ("fleabag", "into the woods")
    named_lookup  names a person: character or author ("regina george",
                  "monologue by chekhov")
    occupation    names a job the character does ("lawyer monologue", "nurse")
    attribute     purely descriptive constraints ("funny 2 minute female")
    multi         two or more of the above in one query
    other         none of the above (free-form themes, gibberish, empty)
"""

from __future__ import annotations

import re
from typing import Optional

from app.services.search.title_lookup import (TITLE_ALIASES,
                                              detect_catalogue_character,
                                              detect_catalogue_title,
                                              detect_title_lookup)

QUERY_TYPES = ("title", "named_lookup", "occupation", "attribute", "multi", "other")

# Jobs actors search by. Kept to occupations that read as a *role* rather than a
# generic noun — "mother" and "student" are excluded because they describe a
# relationship or life stage and would swallow half of `attribute`.
_OCCUPATIONS = {
    "lawyer", "attorney", "barrister", "judge", "doctor", "surgeon", "nurse",
    "teacher", "professor", "detective", "cop", "policeman", "policewoman",
    "police officer", "soldier", "sailor", "general", "priest", "nun",
    "minister", "preacher", "politician", "senator", "president", "king",
    "queen", "prince", "princess", "journalist", "reporter", "writer",
    "novelist", "poet", "painter", "musician", "singer", "dancer", "actor",
    "actress", "waitress", "waiter", "bartender", "chef", "farmer", "maid",
    "butler", "servant", "salesman", "secretary", "banker", "scientist",
    "engineer", "pilot", "spy", "assassin", "gangster", "thief", "prisoner",
    "therapist", "psychiatrist", "coach", "boxer", "athlete",
}

# Authors searched by name often enough to be worth catching without a DB hit.
_KNOWN_AUTHORS = {
    "shakespeare", "chekhov", "ibsen", "wilde", "strindberg", "moliere",
    "sophocles", "euripides", "aeschylus", "marlowe", "shaw", "williams",
    "miller", "o neill", "oneill", "beckett", "pinter", "brecht", "sartre",
    "lorca", "synge", "goldsmith", "sheridan", "webster", "jonson",
}

_BY_AUTHOR = re.compile(r"\b(?:by|written by|from)\s+([a-z][a-z\.\-']*(?:\s+[a-z][a-z\.\-']*){0,2})\b")

# The character-name subset of TITLE_ALIASES. Derived by exclusion so a new
# character added there is picked up automatically; only title *variants* need
# listing here.
_TITLE_VARIANT_ALIASES = {
    "ghosts uk", "spiderman", "spider man", "les mis", "mean girls jr",
    "frozen jr",
}
_CHARACTER_ALIASES = frozenset(TITLE_ALIASES) - _TITLE_VARIANT_ALIASES

# Descriptive vocabulary. Only used when the parser handed us nothing — a
# constraint the real parser found always outranks this list.
# "monologue"/"audition" are NOT here: they are what every query is about, so
# counting them as an attribute would turn every title search into `multi`.
# Bare "man"/"woman"/"girl"/"boy" are deliberately absent: they sit inside too
# many titles and descriptions ("the chess girl", "Gone Girl") to be evidence
# of gender intent. Real gender parsing lands in parsed_constraints, which is
# checked first.
_ATTRIBUTE_WORDS = {
    "funny", "comedic", "comic", "comedy", "dramatic", "drama", "serious",
    "sad", "angry", "anger", "emotional", "heartbreaking", "tragic", "light",
    "dark", "romantic", "male", "female",
    "teen", "teenage", "young", "old", "elderly", "classical", "contemporary",
    "modern", "shakespearean", "minute", "minutes", "second", "seconds",
    "short", "long",
}

# Parsed-constraint keys that describe the PIECE the actor wants. `source_type`
# and `intended_*` are excluded: naming a show sets those as a side effect, and
# counting them would classify every title search as `multi`.
_ATTRIBUTE_KEYS = {
    "tone", "emotion", "gender", "age_range", "category", "era", "theme",
    "themes", "min_duration", "max_duration", "language",
}

_MIN_MEANINGFUL_LEN = 2


def _normalize(text: str) -> str:
    text = re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def _has_occupation(padded: str) -> bool:
    return any(f" {job} " in padded for job in _OCCUPATIONS)


def _has_author(padded: str, intended_author: Optional[str]) -> bool:
    if intended_author:
        return True
    if any(f" {name} " in padded for name in _KNOWN_AUTHORS):
        return True
    return bool(_BY_AUTHOR.search(padded))


def _character_hits(padded: str) -> list[str]:
    """Character aliases present in the query.

    TITLE_ALIASES mixes two things: character names ("regina george") and title
    variants ("les mis", "spiderman"). Only the former means the actor named a
    *person*, so the character subset is listed explicitly rather than reusing
    the whole map.
    """
    return [alias for alias in _CHARACTER_ALIASES if f" {alias} " in padded]


def _has_attribute(padded: str, parsed_constraints: Optional[dict]) -> bool:
    if parsed_constraints and any(k in _ATTRIBUTE_KEYS for k in parsed_constraints):
        return True
    return any(f" {word} " in padded for word in _ATTRIBUTE_WORDS)


def classify_query(
    query: str,
    parsed_constraints: Optional[dict] = None,
    intended_play: Optional[str] = None,
    intended_author: Optional[str] = None,
    db=None,
) -> str:
    """Return one of QUERY_TYPES. Never raises.

    `db` is optional and used only to consult the real title/character catalogue.
    Without it the classifier sees only the ~90-title curated dictionary, so
    every catalogue title ("fleabag", "brooklyn 99") and character ("hamlet",
    "joan clarke") lands in `other` — the reason the 2026-08-27 brief measured
    only 9 of 260 searches as `title`. This stays LOG-ONLY: it feeds nothing in
    ranking or the response, so a catalogue lookup here can only improve an
    analytics label, never a result set.
    """
    try:
        norm = _normalize(query)
        if len(norm) < _MIN_MEANINGFUL_LEN:
            return "other"
        padded = f" {norm} "

        # A character name is a person first and a title hint second. Left
        # alone, "regina george" would count as BOTH (title_lookup resolves the
        # alias to Mean Girls) and every character search would land in
        # `multi`. So the character phrases are removed before asking whether a
        # title was *also* named: "cady heron in mean girls jr" still says both.
        characters = _character_hits(padded)
        is_person = bool(characters) or _has_author(padded, intended_author)
        remainder = padded
        for alias in characters:
            remainder = remainder.replace(f" {alias} ", " ")
        is_title = bool(intended_play) or detect_title_lookup(remainder) is not None
        is_occupation = _has_occupation(padded)
        is_attribute = _has_attribute(padded, parsed_constraints)

        # Catalogue-aware pass (log-only). Ask the real catalogue what the
        # curated dictionary could not. Title wins over character for a word that
        # is both (Hamlet the play vs Hamlet the character) so it does not
        # inflate `multi`.
        if db is not None:
            if not is_title:
                try:
                    if detect_catalogue_title(db, query) is not None:
                        is_title = True
                except Exception:
                    pass
            if not is_title and not is_person:
                try:
                    if detect_catalogue_character(db, query) is not None:
                        is_person = True
                except Exception:
                    pass

        signals = [
            ("title", is_title),
            ("named_lookup", is_person),
            ("occupation", is_occupation),
            ("attribute", is_attribute),
        ]
        hits = [name for name, present in signals if present]
        if len(hits) > 1:
            return "multi"
        if hits:
            return hits[0]
        return "other"
    except Exception:  # pragma: no cover - logging path must never break search
        return "other"
