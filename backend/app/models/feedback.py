"""User feedback (e.g. thumbs up/down on search results)."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship


class ResultFeedback(Base):
    """
    Stores contextual feedback (e.g. "Were these results what you expected?").
    context: e.g. "search"
    rating: "positive" | "negative"
    user_id: optional; null for anonymous feedback.
    """
    __tablename__ = "result_feedback"

    id = Column(Integer, primary_key=True, index=True)
    context = Column(String(64), nullable=False, index=True)
    rating = Column(String(16), nullable=False)  # "positive" | "negative"
    comment = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    # Set when the founder has seen this in the admin feedback inbox. Drives the
    # unread badge; only meaningful for negative (actionable) feedback.
    read_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", backref="result_feedback")


class FeedbackImpression(Base):
    """One row each time the results feedback prompt is actually SHOWN.

    result_feedback records answers; this records the ask. Without it, "1 rating
    in 30 days against ~1,000 searches" is unreadable — a silent prompt and an
    ignored prompt look identical. The response rate (result_feedback rows /
    impressions) tells them apart, which is what decides whether the widget has a
    visibility problem or an indifference problem (H-11).

    Fire-and-forget and deduped client-side per result set, so it counts distinct
    times the prompt was seen, not re-renders. Kept deliberately thin — no
    comment, no rating — so it stays cheap at search volume.
    """
    __tablename__ = "feedback_impressions"

    id = Column(Integer, primary_key=True, index=True)
    context = Column(String(64), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
