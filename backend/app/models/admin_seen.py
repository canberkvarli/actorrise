"""When each admin last looked at a surface.

The nav badges need to answer "what arrived since I last looked", and the two
badges that already work (feedback, review) answer it with a per-row read flag.
That does not generalise: a search log or a trial conversion is not a row anyone
would ever mark read, and back-filling a flag onto every one of them to power a
counter would be absurd. One timestamp per admin per surface is the whole state.

`surface` is a plain string rather than an enum so a new badge is a new constant
here and nothing else. SURFACES is the closed vocabulary; the API validates
against it.
"""

from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

#: Every surface that carries an unseen badge driven by this table. Feedback and
#: Review are deliberately absent -- they keep their own per-row read flags.
SURFACES = ("requests", "searches", "revenue")


class AdminSeen(Base):
    __tablename__ = "admin_seen"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    surface = Column(String(24), primary_key=True)
    seen_at = Column(
        DateTime(timezone=True),
        # Python default as well as now(): the SQLite test fixture strips the
        # server-side default and the column is NOT NULL.
        default=lambda: datetime.now(timezone.utc),
        server_default=sql_text("now()"),
        nullable=False,
    )


def last_seen_at(
    db: Session, user_id: int, surface: str, fallback: datetime
) -> datetime:
    """When this admin last opened `surface`, or `fallback` if never.

    The fallback matters: an admin with no row has not "seen nothing since the
    beginning of time", they are simply new to the surface. The caller passes
    their account creation date so a first load reads a handful rather than the
    entire history.
    """
    row = (
        db.query(AdminSeen)
        .filter(AdminSeen.user_id == user_id, AdminSeen.surface == surface)
        .first()
    )
    if row is None:
        return fallback
    # Postgres hands back an aware datetime from TIMESTAMPTZ; SQLite, which the
    # test fixture runs on, hands back a naive one. Callers compare this against
    # an aware `now()`, and mixing the two raises. Normalise here so the return
    # type does not depend on which database is underneath.
    seen = row.seen_at
    return seen if seen.tzinfo else seen.replace(tzinfo=timezone.utc)


def mark_seen(db: Session, user_id: int, surface: str) -> datetime:
    """Stamp `surface` as seen now. Returns the timestamp written."""
    now = datetime.now(timezone.utc)
    row = (
        db.query(AdminSeen)
        .filter(AdminSeen.user_id == user_id, AdminSeen.surface == surface)
        .first()
    )
    if row:
        row.seen_at = now
    else:
        db.add(AdminSeen(user_id=user_id, surface=surface, seen_at=now))
    db.commit()
    return now
