"""
Audition feedback usage tracking.

Simple table that records each time a user consumes an AI feedback credit.
Monthly usage is calculated by counting rows for the current calendar month.
"""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer
from sqlalchemy import text as sql_text


class AuditionFeedbackUsage(Base):
    """Tracks each AI feedback credit consumed."""

    __tablename__ = "audition_feedback_usage"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    __table_args__ = (
        Index("idx_audition_usage_user_month", "user_id", "created_at"),
    )
