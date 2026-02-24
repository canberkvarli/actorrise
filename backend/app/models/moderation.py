"""
Moderation models for user-submitted content.

Handles:
- User monologue submissions
- AI-assisted moderation workflow
- Manual review process
- Email notification tracking
"""

from app.core.database import Base
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Float,
    Boolean,
    text as sql_text,
)
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship


class MonologueSubmission(Base):
    """
    User submissions with AI moderation workflow.

    Workflow:
    1. User submits → status='pending'
    2. AI analyzes → status='ai_review'
    3. Decision:
       - High quality + low copyright risk → auto-approve → status='approved'
       - Medium risk/quality → status='manual_review' (human moderator)
       - High risk → auto-reject → status='rejected'
    4. If approved, creates Play + Monologue records
    """
    __tablename__ = "monologue_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    monologue_id = Column(Integer, ForeignKey("monologues.id"), nullable=True, index=True)

    # Submission data (what user provided)
    submitted_title = Column(String, nullable=False)
    submitted_text = Column(Text, nullable=False)
    submitted_character = Column(String, nullable=False)
    submitted_play_title = Column(String, nullable=False)
    submitted_author = Column(String, nullable=False)
    user_notes = Column(Text, nullable=True)  # Optional context from user

    # Moderation status: pending, ai_review, manual_review, approved, rejected
    status = Column(String, default="pending", nullable=False, index=True)

    # AI moderation results
    ai_quality_score = Column(Float, nullable=True)  # 0-1 score
    ai_copyright_risk = Column(String, nullable=True)  # 'low', 'medium', 'high'
    ai_flags = Column(JSON, nullable=True)  # {'too_short': True, 'duplicate': True, ...}
    ai_moderation_notes = Column(Text, nullable=True)

    # Manual review (only if status='manual_review')
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reviewer_notes = Column(Text, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Rejection details (if status='rejected')
    rejection_reason = Column(String, nullable=True)  # 'copyright', 'quality', 'duplicate', 'inappropriate'
    rejection_details = Column(Text, nullable=True)

    # Timestamps
    submitted_at = Column(DateTime(timezone=True), server_default=sql_text('now()'), nullable=False, index=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)  # When AI/human made final decision

    # Email notification tracking
    email_sent = Column(Boolean, default=False, nullable=False)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    submitter = relationship("User", foreign_keys=[user_id], backref="submissions")
    reviewer = relationship("User", foreign_keys=[reviewer_id], backref="reviewed_submissions")
    monologue = relationship("Monologue", backref="submission", uselist=False)


class ModerationLog(Base):
    """
    Audit log for all moderation actions.

    Tracks every decision made (AI or human) for transparency and debugging.
    """
    __tablename__ = "moderation_logs"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("monologue_submissions.id"), nullable=False, index=True)
    action = Column(String, nullable=False)  # 'ai_analysis', 'auto_approve', 'auto_reject', 'manual_approve', 'manual_reject'
    actor_type = Column(String, nullable=False)  # 'ai', 'moderator'
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL if AI

    # Action details
    previous_status = Column(String, nullable=True)
    new_status = Column(String, nullable=False)
    reason = Column(Text, nullable=True)
    extra_data = Column("metadata", JSON, nullable=True)  # Additional context (AI scores, flags, etc.); column name "metadata" in DB; "metadata" is reserved by SQLAlchemy

    created_at = Column(DateTime(timezone=True), server_default=sql_text('now()'), nullable=False, index=True)

    # Relationships
    submission = relationship("MonologueSubmission", backref="logs")
    actor = relationship("User", backref="moderation_actions")
