"""The audition tracker (docs/superpowers/specs/2026-10-07-audition-tracker-design.md).

Plural on purpose: app/models/audition_usage.py and /api/audition belong to the
self-tape recorder, which is a different feature.

auditions        one row per audition an actor is going to, or went to
audition_pieces  the monologues or scenes they picked for it ("used" feeds insights)
audition_events  append-only timeline; admin metrics and the prep room read it
audition_reminder_sends  claim rows: the INSERT that wins sends, everyone else skips
"""

import secrets
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB

from app.core.database import Base

KINDS = ("in_person", "self_tape", "virtual")
STATUSES = ("submitted", "scheduled", "callback", "booked", "pinned", "passed")
SOURCES = ("parse", "manual", "onboarding")
CLOSED_STATUSES = ("booked", "passed")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _token() -> str:
    return secrets.token_urlsafe(24)


class Audition(Base):
    __tablename__ = "auditions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project = Column(String(200), nullable=False)
    role = Column(String(200), nullable=True)
    kind = Column(String(16), nullable=False, default="in_person")
    status = Column(String(16), nullable=False, default="scheduled")
    starts_at = Column(DateTime(timezone=True), nullable=True)  # appointment
    due_at = Column(DateTime(timezone=True), nullable=True)  # self-tape deadline
    tz = Column(String(64), nullable=False, default="UTC")  # IANA, from the browser
    location = Column(String(300), nullable=True)
    casting = Column(String(200), nullable=True)
    casting_key = Column(String(200), nullable=True, index=True)
    material_raw = Column(String(300), nullable=True)
    material = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=True)
    bring = Column(String(300), nullable=True)
    notes = Column(Text, nullable=True)
    tape_link = Column(String(500), nullable=True)
    source = Column(String(16), nullable=False, default="manual")
    user_script_id = Column(Integer, ForeignKey("user_scripts.id", ondelete="SET NULL"), nullable=True)
    reminders_on = Column(Boolean, nullable=False, default=True)
    outcome_token = Column(String(48), nullable=False, unique=True, default=_token)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))
    updated_at = Column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now, server_default=sql_text("now()")
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class AuditionPiece(Base):
    __tablename__ = "audition_pieces"

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    # Exactly one of the two is set; enforced in services/auditions/core.add_piece.
    # No FK on purpose: monologues and scenes carry pgvector columns the SQLite
    # test fixture cannot create, and a piece that is later hidden should not
    # take the audition's history down with it.
    monologue_id = Column(Integer, nullable=True)
    scene_id = Column(Integer, nullable=True)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))


class AuditionEvent(Base):
    __tablename__ = "audition_events"

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # created | status_changed | outcome_logged | reminder_sent | note_added
    kind = Column(String(24), nullable=False)
    data = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))


class AuditionReminderSend(Base):
    __tablename__ = "audition_reminder_sends"
    __table_args__ = (UniqueConstraint("audition_id", "moment", name="uq_audition_reminder_moment"),)

    id = Column(Integer, primary_key=True, index=True)
    audition_id = Column(Integer, ForeignKey("auditions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    moment = Column(String(8), nullable=False)  # prep | eve | after
    # YYYY-MM-DD in the audition's tz. One audition email per user per local day.
    local_day = Column(String(10), nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=False, default=_now, server_default=sql_text("now()"))
