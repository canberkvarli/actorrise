"""Hiding a monologue and bringing it back, as one rule in one place.

WHY THIS EXISTS. `review_status` decides whether search may return a row, and
`embedding_vector` decides whether search *can* find it. Those were two
independent facts, and the corpus grew a contradiction:

    4,550 rows retired as too_short / duplicate / not_monologue,
    every one of them still carrying 1536 float32 and an HNSW index entry.

That is 65 MB of a 500 MB quota spent on speeches no query can reach -- the
single largest avoidable item in the database, and the reason the project blew
past the free tier.

Dropping those vectors is safe only because hiding and un-hiding now travel
through here. A retired row can come back: `ungate_above_floor` clears the
status of anything that grows past the word floor, and a moderator can approve
or dismiss a flagged row in the admin. Before this module, either path would
have returned a row to search with no vector attached -- present in the library,
invisible to every semantic query, and nothing would have said so.

The invariant, stated once:

    a hidden row has no embedding; a visible row has one.

`hide()` and `unhide()` are the only supported ways to move a row across that
line, and each one carries the vector with it.
"""

from __future__ import annotations

import logging
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.actor import Monologue
from app.services.search.semantic_search import HIDDEN_REVIEW_STATUSES

logger = logging.getLogger(__name__)


def hide(mono: Monologue, status: str, reasons: Optional[list[str]] = None) -> None:
    """Retire a row from search and release the storage that served it.

    Does not commit; the caller owns the transaction.
    """
    if status not in HIDDEN_REVIEW_STATUSES:
        raise ValueError(
            f"{status!r} is not a hiding status; expected one of "
            f"{sorted(HIDDEN_REVIEW_STATUSES)}"
        )
    mono.review_status = status
    if reasons is not None:
        mono.review_reasons = reasons
    mono.embedding_vector = None


def unhide(db: Session, mono: Monologue, analyzer=None, force_embed: bool = False) -> bool:
    """Return a row to search, re-embedding it if it has no vector.

    Returns True when a fresh embedding was bought. Does not commit.

    Pass ``force_embed`` when the caller has just changed ``text``: the stored
    vector then describes a speech that is no longer there, and keeping it means
    the row answers queries about text an actor will never see.

    A failed embedding call leaves the row hidden rather than visible and
    unfindable: an actor never sees the row either way, and the version that
    stays hidden is the one the next backfill will notice and fix.
    """
    needs_vector = force_embed or mono.embedding_vector is None
    if not needs_vector:
        mono.review_status = None
        mono.review_reasons = None
        mono.proposed_text = None
        return False

    from app.services.ai.content_analyzer import ContentAnalyzer
    from app.services.ai.embedding_text_builder import build_monologue_enriched_text

    analyzer = analyzer or ContentAnalyzer()
    try:
        mono.embedding_vector = analyzer.generate_embedding(
            build_monologue_enriched_text(mono)
        )
    except Exception:
        logger.exception(
            "monologue %s stays hidden: re-embedding failed on un-hide", mono.id
        )
        raise

    mono.review_status = None
    mono.review_reasons = None
    mono.proposed_text = None
    return True


def missing_embeddings(db: Session) -> Iterable[int]:
    """Visible rows that search cannot reach. The invariant, as a query.

    Should always be empty. `scripts/audit_corpus_quality.py` reports it, and a
    non-zero result means something moved a row across the line without going
    through `unhide`.
    """
    from sqlalchemy import or_

    rows = (
        db.query(Monologue.id)
        .filter(
            Monologue.embedding_vector.is_(None),
            or_(
                Monologue.review_status.is_(None),
                Monologue.review_status.notin_(tuple(HIDDEN_REVIEW_STATUSES)),
            ),
        )
        .all()
    )
    return [r.id for r in rows]
