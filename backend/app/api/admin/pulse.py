"""Every admin nav badge, in one poll.

The layout used to poll one endpoint per badge. Two was fine; five would not be,
and each one is a single COUNT that could have travelled with the others. One
endpoint, one round trip, one place to add the next badge.

The counts here are "since you last looked" and read `admin_seen`. Feedback and
Review are folded in unchanged -- they still answer from their own per-row read
flags, which work and are not worth rewriting to prove a point.
"""

from datetime import datetime

from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.admin_filters import test_user_filter
from sqlalchemy import func, or_
from sqlalchemy.orm import Session


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
    """
    return (
        db.query(func.count(ContentRequest.id))
        .filter(ContentRequest.last_requested_at > since)
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
