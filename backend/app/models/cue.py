"""Cue, the in-app assistant that covers for the founder.

Text only, on purpose. Supabase sits near its 500 MB cap and the vector column
is most of it (see supabase-quota memory), so a conversation is a few short rows
and nothing else: no embeddings, no tool payloads, just the tool names. Rows
older than CUE_RETENTION_DAYS are deleted by the hourly sweep in main.py.
"""

from datetime import datetime, timezone

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CueConversation(Base):
    """One actor's thread for one UTC day."""

    __tablename__ = "cue_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), default=_now, server_default=text("now()"), nullable=False)
    last_at = Column(DateTime(timezone=True), default=_now, server_default=text("now()"), nullable=False, index=True)
    # Set when Cue passed this to Canberk. The reason is a short slug
    # ("teacher", "billing", "asked", "resting", ...) so the inbox can group.
    handoff_at = Column(DateTime(timezone=True), nullable=True, index=True)
    handoff_reason = Column(String(32), nullable=True)
    # The founder has opened it in /admin/cue. Drives the badge.
    read_at = Column(DateTime(timezone=True), nullable=True)

    messages = relationship(
        "CueMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="CueMessage.id",
    )


class CueMessage(Base):
    __tablename__ = "cue_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("cue_conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Denormalised so the monthly cap is one indexed count, no join.
    user_id = Column(Integer, nullable=False, index=True)
    role = Column(String(16), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    tools = Column(JSONB(none_as_null=True), nullable=True)  # ["search_monologues", ...]
    input_tokens = Column(Integer, nullable=False, default=0, server_default=text("0"))
    output_tokens = Column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at = Column(DateTime(timezone=True), default=_now, server_default=text("now()"), nullable=False, index=True)

    conversation = relationship("CueConversation", back_populates="messages")
