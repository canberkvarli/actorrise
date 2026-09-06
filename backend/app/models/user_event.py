"""Product events: the funnel between "users row created" and "search_logs row".

One row per thing a user did that no other table records. Deliberately tiny
(who, what, a little context, when) and deliberately NOT the Green Room table:
community_events is public social proof with a privacy whitelist, this is
private instrumentation and never rendered to other users.

Event names are a closed vocabulary in app/services/events.py. Adding an event
means adding a name there, not inventing one at the call site.
"""

from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB


class UserEvent(Base):
    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, index=True)
    # SET NULL rather than CASCADE: a deleted account's funnel rows still count
    # in aggregate ("46% never searched") even once nobody can say whose.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_name = Column(String(48), nullable=False)
    # JSONB in Postgres; plain JSON under the SQLite test fixture, which cannot
    # render the Postgres-only type. The default is an uncast '{}' for the same
    # reason: Postgres coerces it to jsonb, SQLite chokes on the `::`.
    properties = Column(
        JSON().with_variant(JSONB(), "postgresql"),
        nullable=False,
        server_default=sql_text("'{}'"),
    )
    # Python default as well as now(): the SQLite fixture strips server-side
    # now() and the column is NOT NULL, so a row written in a test needs one.
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=sql_text("now()"),
        nullable=False,
    )

    __table_args__ = (
        # Every question this table answers is "which users did X" or "how many
        # X in the last N days", so those are the two indexes.
        Index("ix_user_events_user_id", "user_id"),
        Index("ix_user_events_name_created", "event_name", "created_at"),
    )

    def __repr__(self):
        return f"<UserEvent user_id={self.user_id} {self.event_name}>"
