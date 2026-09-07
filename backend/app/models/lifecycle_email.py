"""One row per (user, lifecycle touch) that has been sent.

The day-1 saved-piece reminder dedupes on a column of monologue_favorites,
because that email is about one favorite. The day-3 and day-10 touches are
about the person, so the claim lives on its own table keyed by user and touch.
The UNIQUE constraint is the send-at-most-once guarantee: the process that wins
the INSERT sends, everyone else gets an IntegrityError and moves on.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import text as sql_text

from app.core.database import Base


class LifecycleEmailSend(Base):
    __tablename__ = "lifecycle_email_sends"
    __table_args__ = (UniqueConstraint("user_id", "touch", name="uq_lifecycle_email_user_touch"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    touch = Column(String(16), nullable=False)  # day3 | day10
    anchor = Column(String(16), nullable=True)  # favorite | search | none: what the email reopened
    sent_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sql_text("now()"),
    )
