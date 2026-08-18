"""Close rehearsal sessions that were left hanging in `in_progress`.

38 rows sat in `in_progress` in prod, which makes the status column meaningless
and poisons the completion math that was fixed once already (see memory:
rehearsal-completion-and-sessions-dashboard). A session with no activity since
the cutoff is treated as abandoned: the user closed the tab and never came back.

Two callers:
  * on new-session start, scoped to that one user, so the count stays low; and
  * a global backfill/sweep (scripts/close_stuck_sessions.py).
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.actor import RehearsalSession

# A session untouched for this long is considered abandoned. Long enough that a
# genuinely paused session (still resumable, see Task 15) is never swept.
STALE_AFTER_HOURS = 6


def stale_cutoff(now: datetime, hours: int = STALE_AFTER_HOURS) -> datetime:
    """The timestamp before which an inactive in_progress session is stale."""
    return now - timedelta(hours=hours)


def is_session_stale(
    status: str,
    last_activity_at: Optional[datetime],
    now: datetime,
    hours: int = STALE_AFTER_HOURS,
) -> bool:
    """Pure decision: is a session stale enough to abandon?

    Only `in_progress` sessions qualify (a finished one is never reopened). A
    session with no activity timestamp at all is treated as stale; otherwise it
    is stale once its last activity predates the cutoff. The SQL in
    ``find_stale_sessions`` mirrors this exactly.
    """
    if status != "in_progress":
        return False
    if last_activity_at is None:
        return True
    return last_activity_at < stale_cutoff(now, hours)


def find_stale_sessions(
    db: Session,
    now: Optional[datetime] = None,
    hours: int = STALE_AFTER_HOURS,
    user_id: Optional[int] = None,
) -> List[RehearsalSession]:
    """in_progress sessions whose last activity predates the cutoff.

    Activity = updated_at, falling back to started_at for rows never updated.
    Scoped to one user when ``user_id`` is given.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = stale_cutoff(now, hours)
    last_activity = func.coalesce(RehearsalSession.updated_at, RehearsalSession.started_at)
    q = db.query(RehearsalSession).filter(
        RehearsalSession.status == "in_progress",
        last_activity < cutoff,
    )
    if user_id is not None:
        q = q.filter(RehearsalSession.user_id == user_id)
    return q.all()


def abandon_stale_sessions(
    db: Session,
    now: Optional[datetime] = None,
    hours: int = STALE_AFTER_HOURS,
    user_id: Optional[int] = None,
) -> int:
    """Mark stale in_progress sessions 'abandoned' (stamping completed_at).

    Returns the number closed. Commits only when something changed.
    """
    now = now or datetime.now(timezone.utc)
    stale = find_stale_sessions(db, now=now, hours=hours, user_id=user_id)
    if not stale:
        return 0
    for s in stale:
        s.status = "abandoned"
        if s.completed_at is None:
            s.completed_at = now
    db.commit()
    return len(stale)
