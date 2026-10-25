"""The scene shelf: two-person scenes an actor can browse and take into rehearsal.

A row is a pointer, never the scene's words. Two kinds:

- ``public_domain``: a stretch of a play whose full text we already hold, as
  character offsets into ``plays.full_text``. The lines are cut out of the play
  only when someone presses Rehearse, and copied into that actor's own scripts.
- ``shared``: an actor's note of where a scene sits in a script they uploaded
  (film, TV or a play under copyright). The script's text stays theirs; another
  actor brings their own copy.

About a kilobyte a row, no embedding: the shelf is browsed by filters, and the
database sits near the Supabase free plan's 500 MB (2026-10-25).
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import text as sql_text

from app.core.database import Base

SHELF_KINDS = ("public_domain", "shared")
WORK_KINDS = ("play", "film", "tv")
SHELF_STATUSES = ("live", "hidden")


class ShelfScene(Base):
    __tablename__ = "shelf_scenes"

    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(16), nullable=False, index=True)
    status = Column(String(16), nullable=False, server_default="live", index=True)

    # The work the scene comes from.
    work_title = Column(String(200), nullable=False)
    work_kind = Column(String(8), nullable=False, server_default="play")
    author = Column(String(200), nullable=True)
    year = Column(Integer, nullable=True)

    # public_domain: where the scene sits in plays.full_text.
    play_id = Column(Integer, ForeignKey("plays.id", ondelete="CASCADE"), nullable=True, index=True)
    start_offset = Column(Integer, nullable=True)
    end_offset = Column(Integer, nullable=True)
    # sha256 of full_text[start:end] when it was cut, so a re-ingested play
    # whose text moved is noticed instead of cut in the wrong place.
    text_hash = Column(String(64), nullable=True)

    # shared: who shared it and the scene in their own script it came from.
    shared_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    source_scene_id = Column(Integer, ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    show_name = Column(Boolean, nullable=False, server_default=sql_text("false"))
    # "Act 2, the garden", "about 40 minutes in", "pages 31 to 34".
    where_in_work = Column(String(200), nullable=True)

    # What the shelf filters on.
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    character_1_name = Column(String(80), nullable=False)
    character_2_name = Column(String(80), nullable=False)
    character_1_gender = Column(String(16), nullable=True)
    character_2_gender = Column(String(16), nullable=True)
    character_1_age_range = Column(String(16), nullable=True)
    character_2_age_range = Column(String(16), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    line_count = Column(Integer, nullable=True)
    tone = Column(String(32), nullable=True)
    era = Column(String(16), nullable=True)  # classical | modern

    open_count = Column(Integer, nullable=False, server_default=sql_text("0"))
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text("now()"))
