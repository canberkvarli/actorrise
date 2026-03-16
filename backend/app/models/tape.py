"""
User tape model for the Self-Tape Audition Mode.

Stores metadata for saved self-tape recordings (Plus/Pro tiers).
Video files are stored in Supabase Storage; this table tracks references.
"""

from app.core.database import Base
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index,
    Integer, String, Text, BigInteger,
)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
import uuid


class UserTape(Base):
    """A saved self-tape recording."""

    __tablename__ = "user_tapes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    file_path = Column(String(500), nullable=False)  # Path in Supabase Storage
    file_size_bytes = Column(BigInteger, nullable=True)
    share_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, nullable=False)
    is_shared = Column(Boolean, default=False, nullable=False)

    # Optional link to source material
    monologue_id = Column(Integer, ForeignKey("monologues.id", ondelete="SET NULL"), nullable=True)
    script_id = Column(Integer, ForeignKey("user_scripts.id", ondelete="SET NULL"), nullable=True)

    # AI feedback stored as JSON (nullable — only populated when user requests it)
    ai_feedback = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=sql_text("now()"), onupdate=sql_text("now()"))

    # Relationships
    user = relationship("User", backref="tapes")

    __table_args__ = (
        Index("idx_user_tapes_share_uuid", "share_uuid"),
    )
