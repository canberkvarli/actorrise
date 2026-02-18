"""User feedback (e.g. thumbs up/down on search results)."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, text
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    user = relationship("User", backref="result_feedback")
