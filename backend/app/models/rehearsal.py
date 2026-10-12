"""ScenePartner v2: the partner-audio cache and the rehearsal journal.

A run is append-only. Nothing here is a counter; every number a screen shows
is derived from the events (see services/rehearsal/journal.py). That is the
lesson of RehearsalSession, whose hand-kept counters never once agreed.
"""
from sqlalchemy import (JSON, Boolean, Column, DateTime, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import relationship

from app.core.database import Base


class PartnerAudio(Base):
    """One synthesised partner line, keyed by what was said and who said it,
    never by scene, so a line shared by two scenes is one file."""
    __tablename__ = "partner_audio"

    key = Column(String(64), primary_key=True)  # sha256 hex, see partner_audio.audio_key
    vendor = Column(String(16), nullable=False)
    voice = Column(String(64), nullable=False)
    storage_path = Column(String(128), nullable=True)
    status = Column(String(8), nullable=False, server_default="pending")  # pending | ready | failed
    error = Column(Text, nullable=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))


class RehearsalRun(Base):
    __tablename__ = "rehearsal_runs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)
    character = Column(String, nullable=False)  # the actor's part
    voices = Column(JSON, nullable=False, default=dict)  # {character: voice}
    is_guided = Column(Boolean, nullable=False, default=False)
    started_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    events = relationship("RehearsalEvent", back_populates="run", cascade="all, delete-orphan")


class RehearsalEvent(Base):
    __tablename__ = "rehearsal_events"
    __table_args__ = (UniqueConstraint("run_id", "seq", name="uq_rehearsal_event_seq"),)

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("rehearsal_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=False)
    type = Column(String(24), nullable=False)
    line_index = Column(Integer, nullable=True)
    at_ms = Column(Integer, nullable=False)  # audio-clock ms since the run began
    payload = Column(JSON, nullable=False, default=dict)
    received_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    run = relationship("RehearsalRun", back_populates="events")


EVENT_TYPES = frozenset({
    "started", "line_reached", "actor_line_read", "partner_line_played",
    "paused", "resumed", "jumped", "completed", "abandoned",
})
