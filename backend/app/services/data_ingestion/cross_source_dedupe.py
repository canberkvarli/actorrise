"""Duplicate detection that works across sources.

`MonologueDeduplicator` only compares a candidate against monologues from the
same play title AND author, so it never finds anything when the same work
arrives under a different label — "Hamlet" / "Shakespeare" against "The Tragedy
of Hamlet" / "William Shakespeare". It is also unwired from the film and TV
ingests entirely; only scrape_all_sources.py calls it. The corpus carries 259
duplicate pairs as a result, 82 of them byte-identical.

Two checks here, neither of which needs the metadata to agree:

* **Fingerprint** — a hash of the text with case, punctuation and whitespace
  removed. Free, exact, and catches the same speech arriving twice with
  different quote glyphs or spacing.

* **Vector** — nearest neighbour on the embedding that already exists, using the
  HNSW index. Catches near-identical text (a line trimmed, a name corrected)
  that the hash misses.

The threshold is calibrated, not guessed: on the live corpus the nearest
neighbour of a random monologue sits at a median cosine distance of 0.19, while
every pair inspected below 0.03 was the same character in the same title. 0.02
is deliberately inside that gap — this decides whether to DISCARD someone's
work, so it should only fire when it is obvious.
"""

from __future__ import annotations

import hashlib
import re
from typing import Optional

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.actor import Monologue
from app.models.rejected_extraction import RejectedExtraction

#: Cosine distance at or below which two monologues are the same speech.
#: See the module docstring for how this was calibrated.
DUPLICATE_DISTANCE = 0.02

#: How many neighbours to examine. The nearest is almost always the answer; a
#: couple more cost nothing and cover a row that duplicates several others.
_NEIGHBOURS = 3

_NON_WORD = re.compile(r"[^a-z0-9]+")


def text_fingerprint(text: str) -> str:
    """Stable hash of a monologue's words, ignoring how they were typeset.

    Case, punctuation, quote style and whitespace all vary between sources for
    the same speech, so all of them are removed before hashing.

    md5 rather than sha256 so Postgres can compute the identical value in SQL
    (see :func:`_fingerprint_sql`) — this is duplicate detection, not security,
    and the two implementations must agree.
    """
    normalised = _NON_WORD.sub("", (text or "").lower())
    return hashlib.md5(normalised.encode("utf-8")).hexdigest()


def _fingerprint_sql():
    """The SQL twin of :func:`text_fingerprint`, evaluated in the database.

    Doing this in Python would mean pulling all 14k monologue texts across the
    wire for every candidate. As an expression it is one query, and it can be
    indexed if ingest volume ever makes the scan matter:

        CREATE INDEX ix_monologues_fingerprint ON monologues
          (md5(regexp_replace(lower(text), '[^a-z0-9]', '', 'g')));
    """
    return func.md5(
        func.regexp_replace(func.lower(Monologue.text), "[^a-z0-9]", "", "g")
    )


def find_duplicate(
    db: Session,
    text: str,
    embedding: Optional[list[float]] = None,
    *,
    exclude_id: Optional[int] = None,
    distance: float = DUPLICATE_DISTANCE,
) -> Optional[tuple[int, str]]:
    """Return ``(existing_id, reason)`` if this monologue is already stored.

    ``embedding`` is optional; without it only the fingerprint check runs, which
    still catches exact re-ingestion. Pass it during ingest — it has to be
    generated anyway — to catch the near-identical cases too.
    """
    fp = text_fingerprint(text)
    if fp == text_fingerprint(""):
        return None  # empty text is not a duplicate of anything

    q = db.query(Monologue.id).filter(_fingerprint_sql() == fp)
    if exclude_id is not None:
        q = q.filter(Monologue.id != exclude_id)
    hit = q.first()
    if hit:
        return hit[0], "identical_text"

    if embedding is None:
        return None

    vq = db.query(
        Monologue.id,
        Monologue.embedding_vector.cosine_distance(embedding).label("dist"),
    ).filter(Monologue.embedding_vector.isnot(None))
    if exclude_id is not None:
        vq = vq.filter(Monologue.id != exclude_id)
    for mono_id, dist in vq.order_by("dist").limit(_NEIGHBOURS).all():
        if dist is not None and dist <= distance:
            return mono_id, f"near_identical:{dist:.4f}"

    return None

# --- the skip list --------------------------------------------------------
#
# `find_duplicate` answers "do we already HAVE this?". These answer "have we
# already TURNED THIS DOWN?", which is a different and previously unasked
# question. Without it, re-reading a source re-parses, re-language-checks and
# sometimes re-LLMs its way to a verdict we reached last time, and a short piece
# that was deleted to reclaim space looks brand new on every pass.


def was_rejected(db: Session, text: str) -> Optional[str]:
    """Return the reason this exact candidate was refused before, or None."""
    fp = text_fingerprint(text)
    if fp == text_fingerprint(""):
        return None
    row = (
        db.query(RejectedExtraction.reason)
        .filter(RejectedExtraction.fingerprint == fp)
        .first()
    )
    return row[0] if row else None


def record_rejection(
    db: Session,
    text: str,
    reason: str,
    *,
    word_count: Optional[int] = None,
    character_name: Optional[str] = None,
    play_title: Optional[str] = None,
    source_url: Optional[str] = None,
) -> None:
    """Remember that this candidate was refused, without keeping its text.

    Seeing the same one again bumps `times_seen` rather than inserting a second
    row — a climbing count is the signal that a scraper keeps re-reading a
    document it should be skipping.

    Does NOT commit. The caller owns the transaction, so a rejection recorded
    beside an insert lands or rolls back with it.
    """
    fp = text_fingerprint(text)
    if fp == text_fingerprint(""):
        return

    # One statement, so the check and the write cannot come apart.
    #
    # This was a SELECT followed by db.add, and both halves of that failed. The
    # ingest sessions run with autoflush=False, so a pending add earlier in the
    # SAME transaction is invisible to the query -- a speech rejected twice in
    # one book queued two inserts and the commit died on the primary key. Four
    # parallel sweep workers raced the same way across books. Either one takes
    # the whole worker down mid-run, which is how shard 0 stopped after 43
    # books with an IntegrityError on `rejected_extractions_pkey`.
    table = RejectedExtraction.__table__
    db.execute(
        pg_insert(table)
        .values(
            fingerprint=fp,
            reason=reason,
            word_count=word_count if word_count is not None else len(text.split()),
            character_name=(character_name or None),
            play_title=(play_title or None),
            source_url=(source_url or None),
        )
        .on_conflict_do_update(
            index_elements=["fingerprint"],
            # Keep the ORIGINAL reason and provenance: the first sighting is the
            # one that explains why this text is on the skip list.
            set_={
                "times_seen": func.coalesce(table.c.times_seen, 1) + 1,
                "last_seen_at": func.now(),
            },
        )
    )
