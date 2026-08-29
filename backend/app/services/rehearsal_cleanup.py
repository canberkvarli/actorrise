"""Close rehearsal sessions that were left hanging in `in_progress`.

38 rows sat in `in_progress` in prod, which makes the status column meaningless
and poisons the completion math that was fixed once already (see memory:
rehearsal-completion-and-sessions-dashboard). A session with no activity since
the cutoff never got an ending: the user closed the tab and never came back.

Swept sessions are marked `timed_out`, NOT `abandoned`. The two are different
events and blurring them cost us a real signal:

  * `abandoned` — the client fired the abandon beacon on the way out. We know
    the moment they left and how long they stayed.
  * `timed_out` — they vanished. We only know they were last seen at
    `last_activity`, and we learn it whenever the sweep next runs.

Because we only find out later, `completed_at` on a swept row must be stamped
with the last known activity, not with sweep time. Stamping `now()` produced
rows whose "completed_at" sat 30+ days after they started — a session that
looked like it ran for a month.

Three callers:
  * hourly sweep in main.py's scheduler (the one that actually keeps this tidy);
  * on new-session start, scoped to that one user; and
  * a manual backfill (scripts/close_stuck_sessions.py).
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.actor import RehearsalLineDelivery, RehearsalSession

# A session untouched for this long is considered over. Long enough that a
# genuinely paused session (still resumable, see Task 15) is never swept.
STALE_AFTER_HOURS = 6

# Status written by the sweep. Distinct from "abandoned" so the dashboard can
# say "left mid-scene" and "went silent" separately.
TIMED_OUT_STATUS = "timed_out"

# Both mean "started but never finished". Completion math needs the union;
# anything reporting *why* needs them apart.
UNFINISHED_STATUSES = ("abandoned", TIMED_OUT_STATUS)


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


def last_delivery_times(db: Session, session_ids: List[int]) -> dict:
    """The last line each session actually delivered, keyed by session id.

    This — not ``updated_at`` — is the only trustworthy record of when an actor
    was last present. ``updated_at`` moves on *any* write to the row, so the
    August 2026 bulk backfill stamped 38 sessions with one identical timestamp;
    deriving a duration from it produced 221-day rehearsals. A line delivery is
    a thing the user did.
    """
    if not session_ids:
        return {}
    rows = (
        db.query(
            RehearsalLineDelivery.session_id,
            func.max(RehearsalLineDelivery.delivered_at),
        )
        .filter(RehearsalLineDelivery.session_id.in_(session_ids))
        .group_by(RehearsalLineDelivery.session_id)
        .all()
    )
    return {sid: last for sid, last in rows if last is not None}


def session_duration_seconds(
    session: RehearsalSession, last_activity: Optional[datetime]
) -> Optional[int]:
    """Start to last known activity.

    A session with no activity at all lasted zero seconds — they opened it and
    never spoke a line. That is a real finding, not missing data, so it is
    recorded as 0 rather than left NULL. Leaving it NULL is what biased the old
    average duration: it only ever saw sessions people bothered to exit
    properly.
    """
    started = session.started_at
    if started is None:
        return None
    if last_activity is None:
        return 0
    return max(0, int((last_activity - started).total_seconds()))


def close_stale_sessions(
    db: Session,
    now: Optional[datetime] = None,
    hours: int = STALE_AFTER_HOURS,
    user_id: Optional[int] = None,
) -> int:
    """Mark stale in_progress sessions `timed_out`.

    ``completed_at`` is stamped with the last known activity rather than sweep
    time — we are recording when the actor was last here, not when we got round
    to noticing. ``duration_seconds`` is filled in for the same reason, so the
    average duration stops being drawn only from tidy exits.

    Returns the number closed. Commits only when something changed.
    """
    now = now or datetime.now(timezone.utc)
    stale = find_stale_sessions(db, now=now, hours=hours, user_id=user_id)
    if not stale:
        return 0

    deliveries = last_delivery_times(db, [s.id for s in stale])
    for s in stale:
        # Delivered lines first (hard evidence), then updated_at (fine for a
        # session that was live until recently), then start.
        last_activity = deliveries.get(s.id) or s.updated_at or s.started_at
        s.status = TIMED_OUT_STATUS
        if s.completed_at is None:
            s.completed_at = last_activity
        if s.duration_seconds is None:
            s.duration_seconds = session_duration_seconds(s, deliveries.get(s.id))
    db.commit()
    return len(stale)


# Old name, kept so nothing breaks mid-deploy. The behaviour changed (see the
# module docstring): swept sessions are `timed_out`, not `abandoned`.
abandon_stale_sessions = close_stale_sessions
