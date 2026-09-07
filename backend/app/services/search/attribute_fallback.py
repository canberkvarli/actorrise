"""Answer a bare abstract word from the attribute columns.

`query_type='other'` is 369 of 932 searches and 175 of the 272 weak ones, 64%
of all failure (audit, 2026-09-06). They are single broad words: war, crazy,
hopeful, sarcastic, power dynamics, fantasy setting.

One word carries too little signal for a 1536-dimension embedding of a 150-word
speech, so the cosine lands under the 0.38 floor and `_apply_relevance_floor`
returns nothing. "power dynamics" scored 0.294 and showed an empty stage while
**10,418 monologues carry the theme `power`**. The answer was in a column the
vector path never reads.

So when similarity has nothing to say, ask the catalogue instead. The corpus has
a small controlled vocabulary of themes (identity, power, betrayal, family,
love, isolation, ambition, freedom, death, fate, ...), plus tone and emotion,
and a bare abstract word is very often literally one of those values.

This is a FALLBACK. It runs only when the ordinary path came back empty, so it
can never dilute a search that already worked.
"""

from __future__ import annotations

import re
import time
from typing import Dict, List, Optional, Tuple

from app.models.actor import Monologue, Play
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from .semantic_search import exclude_hidden

#: Attribute values are stable, so the vocabulary is read once and cached rather
#: than re-queried per search. An hour is short enough that an ingest adding a
#: new theme shows up the same session.
_VOCAB_TTL_SECONDS = 3600
_vocab_cache: Optional[Tuple[float, Dict[str, set]]] = None

#: Words that are a valid theme but far too common to route on their own. "love"
#: as a whole query is a real search; "love" inside "the love of my life is
#: dead" is not a routing signal. Only whole-query-ish matches route, so this is
#: a small list rather than a stopword corpus.
_TOO_GENERIC = frozenset({"other", "none", "unknown"})


def _load_vocabulary(db: Session) -> Dict[str, set]:
    """The attribute values actually present in the corpus, by column.

    Read from the data rather than hardcoded: a hand-kept copy of a vocabulary
    is how the recommender ended up matching Comedy and Drama against a column
    that only ever held "classical" and "contemporary".
    """
    global _vocab_cache
    now = time.time()
    if _vocab_cache and now - _vocab_cache[0] < _VOCAB_TTL_SECONDS:
        return _vocab_cache[1]

    vocab: Dict[str, dict] = {"themes": {}, "tone": {}, "primary_emotion": {}}

    # Values are stored WITH their row counts, because coverage is how ties are
    # broken. "power dynamics" matches both a rare theme spelled exactly that
    # and the emotion "power"; without counts the rare one won and the search
    # returned nothing, which is the failure this module exists to prevent.
    #
    # themes is a varchar[], so it has to be unnested; the other two are plain
    # columns. Column names are fixed literals here, never query input.
    rows = db.execute(
        text(
            "SELECT lower(t), count(*) FROM monologues, unnest(themes) t "
            "WHERE t <> '' GROUP BY 1"
        )
    ).fetchall()
    vocab["themes"] = {r[0]: int(r[1]) for r in rows if r[0]}

    for col in ("tone", "primary_emotion"):
        rows = db.execute(
            text(
                f"SELECT lower({col}), count(*) FROM monologues "  # noqa: S608 - fixed literal
                f"WHERE {col} IS NOT NULL AND {col} <> '' GROUP BY 1"
            )
        ).fetchall()
        vocab[col] = {r[0]: int(r[1]) for r in rows if r[0]}

    for key in vocab:
        for junk in _TOO_GENERIC:
            vocab[key].pop(junk, None)

    _vocab_cache = (now, vocab)
    return vocab


def _tokens(query: str) -> List[str]:
    """Whole words plus adjacent pairs, so "power dynamics" can match `power`
    and a two-word attribute value can match as a unit."""
    words = [w for w in re.split(r"[^a-z]+", (query or "").lower()) if len(w) > 2]
    pairs = [f"{a} {b}" for a, b in zip(words, words[1:])]
    return pairs + words


#: Below this many pieces a value is too thin to be worth routing a whole
#: search to. It exists to stop a one-row theme swallowing a query that the
#: ordinary path could have answered better.
_MIN_COVERAGE = 5


def detect_attributes(db: Session, query: str) -> Dict[str, str]:
    """The single attribute a bare query names, or {} if none.

    Only fires on a SHORT query. "war" should route to a theme; a fifteen-word
    description that happens to contain the word war should not, because the
    vector path handles that far better and is already succeeding on it (long
    queries are the healthiest on the platform, 9% weak against 45% for one
    word).

    Returns ONE attribute, never several ANDed together. "power dynamics" hits
    a rare theme spelled exactly that AND the emotion "power"; requiring both
    returned zero rows, which is precisely the empty stage this replaces. The
    best-covered single match is the safe answer.
    """
    words = [w for w in re.split(r"[^a-z]+", (query or "").lower()) if w]
    if not words or len(words) > 4:
        return {}

    vocab = _load_vocabulary(db)
    best: Optional[Tuple[int, str, str]] = None
    for token in _tokens(query):
        for col in ("themes", "tone", "primary_emotion"):
            count = vocab[col].get(token, 0)
            if count < _MIN_COVERAGE:
                continue
            if best is None or count > best[0]:
                best = (count, col, token)
    return {best[1]: best[2]} if best else {}


def attribute_search(
    db: Session,
    query: str,
    filters: Optional[dict] = None,
    limit: int = 20,
) -> Tuple[List[Tuple[Monologue, float]], Dict[str, str]]:
    """Pieces matching the attributes a bare query names.

    Returns ``([], {})`` when the query names nothing, so the caller can fall
    through to whatever it did before.

    Ordered the way the recommender orders its SQL pool: well-liked first,
    penalised by how overdone the piece is, so a broad word returns pieces an
    actor might actually want rather than an arbitrary slice of 10,000 rows.
    """
    matched = detect_attributes(db, query)
    if not matched:
        return [], {}

    q = exclude_hidden(db.query(Monologue).join(Play))

    if "themes" in matched:
        q = q.filter(Monologue.themes.any(matched["themes"]))
    if "tone" in matched:
        q = q.filter(func.lower(Monologue.tone) == matched["tone"])
    if "primary_emotion" in matched:
        q = q.filter(func.lower(Monologue.primary_emotion) == matched["primary_emotion"])

    filters = filters or {}
    source = filters.get("source_type")
    if source:
        values = source if isinstance(source, list) else [source]
        q = q.filter(or_(*[Play.source_type == v for v in values]))
    if filters.get("gender"):
        q = q.filter(
            or_(
                Monologue.character_gender.ilike(f"%{filters['gender']}%"),
                Monologue.character_gender.is_(None),
            )
        )

    ordering = (
        Monologue.favorite_count * (1.0 - func.coalesce(Monologue.overdone_score, 0.0))
    ).desc()
    rows = q.order_by(ordering).limit(limit).all()

    # A flat, honestly-low score. These are attribute matches, not similarity
    # matches, and inventing a cosine here would poison the weak_match signal
    # the whole search dashboard is built on.
    return [(m, 0.0) for m in rows], matched
