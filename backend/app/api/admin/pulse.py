"""Every admin nav badge, in one poll.

The layout used to poll one endpoint per badge. Two was fine; five would not be,
and each one is a single COUNT that could have travelled with the others. One
endpoint, one round trip, one place to add the next badge.

The counts here are "since you last looked" and read `admin_seen`. Feedback and
Review are folded in unchanged -- they still answer from their own per-row read
flags, which work and are not worth rewriting to prove a point.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue
from app.models.admin_seen import SURFACES, last_seen_at, mark_seen
from app.models.content_request import ContentRequest
from app.services.content_request_resolution import OPEN_STATUSES
from app.models.feedback import ResultFeedback
from app.models.search_log import SearchLog
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.admin_filters import test_user_filter
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "pulse"])


def _staff_ids(db: Session) -> list[int]:
    """Internal accounts, whose activity must never drive a badge.

    Without this the founder's own searches badge the founder. The rule lives in
    `admin_filters.test_user_filter` and is shared with every other admin stat,
    so a new staff account disappears from all of them at once.
    """
    return [r[0] for r in db.query(User.id).filter(test_user_filter()).all()]


def unseen_requests(db: Session, since: datetime) -> int:
    """Titles asked for since `since`.

    Keyed on `last_requested_at`, not `first_requested_at`: a request that was
    already counted once and has now been asked for again is new information,
    and burying it because the row is old is the exact failure this badge exists
    to fix.

    Only OPEN rows count. A row that has been answered or turned down is not
    work, and a badge that a closed row can hold up is a badge you learn to
    ignore -- which is the failure this whole thing exists to fix.
    """
    return (
        db.query(func.count(ContentRequest.id))
        .filter(
            ContentRequest.last_requested_at > since,
            ContentRequest.status.in_(OPEN_STATUSES),
        )
        .scalar()
        or 0
    )


def unseen_bad_searches(db: Session, since: datetime) -> int:
    """Searches since `since` that came back empty or weak.

    The predicate mirrors the raw SQL in `admin/searches.py::_compute_summary`
    ("results_count = 0 OR weak_match IS TRUE"). One count, not zero plus weak
    added together: rows that are both must be counted once.

    `user_id IS NULL` is an anonymous search -- a real logged-out actor, counted.
    """
    staff = _staff_ids(db)
    q = db.query(func.count(SearchLog.id)).filter(
        SearchLog.created_at > since,
        or_(SearchLog.results_count == 0, SearchLog.weak_match.is_(True)),
    )
    if staff:
        q = q.filter(or_(SearchLog.user_id.is_(None), SearchLog.user_id.notin_(staff)))
    return q.scalar() or 0


def unseen_conversions(db: Session, since: datetime) -> int:
    """Trials that turned into money since `since`."""
    staff = _staff_ids(db)
    q = db.query(func.count(UserEvent.id)).filter(
        UserEvent.created_at > since,
        UserEvent.event_name == "trial_converted",
    )
    if staff:
        q = q.filter(or_(UserEvent.user_id.is_(None), UserEvent.user_id.notin_(staff)))
    return q.scalar() or 0


def _unread_feedback(db: Session) -> int:
    """Mirrors `admin/feedback.py::feedback_summary`'s `unread`."""
    return (
        db.query(func.count(ResultFeedback.id))
        .filter(
            ResultFeedback.rating == "negative",
            ResultFeedback.read_at.is_(None),
            ResultFeedback.comment.isnot(None),
            func.trim(ResultFeedback.comment) != "",
        )
        .scalar()
        or 0
    )


def _pending_review(db: Session) -> int:
    """Mirrors `admin/monologues.py::admin_review_queue_count`."""
    return db.query(Monologue).filter(Monologue.review_status == "pending").count()


@router.get("/pulse")
def admin_pulse(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Every nav badge count in one call.

    `_mod.created_at` is the fallback for a surface this admin has never opened:
    counting from epoch would have the Search badge read four figures on first
    load, which is indistinguishable from broken.

    That column is nullable, and a NULL there must not become a NULL comparison
    that silently counts zero. An admin with no creation date gets a week.
    """
    floor = _mod.created_at or datetime.now(timezone.utc) - timedelta(days=7)
    if floor.tzinfo is None:
        floor = floor.replace(tzinfo=timezone.utc)
    return {
        "feedback": _unread_feedback(db),
        "review": _pending_review(db),
        "requests": unseen_requests(db, last_seen_at(db, _mod.id, "requests", floor)),
        "searches": unseen_bad_searches(
            db, last_seen_at(db, _mod.id, "searches", floor)
        ),
        "revenue": unseen_conversions(db, last_seen_at(db, _mod.id, "revenue", floor)),
    }


@router.post("/seen/{surface}")
def mark_surface_seen(
    surface: str = Path(...),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Stamp a surface as seen. Called on page mount."""
    if surface not in SURFACES:
        raise HTTPException(
            status_code=422,
            detail=f"surface must be one of: {', '.join(SURFACES)}",
        )
    seen_at = mark_seen(db, _mod.id, surface)
    return {"surface": surface, "seen_at": seen_at.isoformat()}
