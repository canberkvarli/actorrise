"""Nights in the work: what an actor says they worked on, one row a thing.

Ghost Light's check-in. Work done away from the app counts as much as work
done in it (a class, a rehearsal for a show, an audition), so the streak is
honest about an actor's life, and it is kept here rather than on the phone so
a new phone remembers it. `day` is the actor's own date, from the phone.
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base

#: What a night's work can be.
PRACTICE_KINDS = ("speech", "scene", "class", "audition", "rehearsal")


class PracticeEntry(Base):
    __tablename__ = "practice_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Date, nullable=False, index=True)
    kind = Column(String(16), nullable=False)
    note = Column(String(280), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PracticeTiming(Base):
    """How long a timed session ran, for a check-in made from the timer.

    Its own table so practice_entries needs no new column; a check-in made
    away from the app has no row here.
    """

    __tablename__ = "practice_timings"

    entry_id = Column(Integer, ForeignKey("practice_entries.id", ondelete="CASCADE"), primary_key=True)
    seconds = Column(Integer, nullable=False)
