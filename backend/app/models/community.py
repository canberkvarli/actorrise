"""Community feed ("Green Room") - one row per public activity event.

Privacy by construction: this table NEVER stores raw search text. The writer
(record_event) only accepts a whitelist of parsed/safe fields, so a query like
"sex scene monologue" can never land here — only its extracted filters (tone,
gender, age_range) do. Display name / city / headshot are joined from the
actor profile at READ time, so a user flipping users.share_activity off hides
their entire history retroactively.
"""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB


class CommunityEvent(Base):
    __tablename__ = "community_events"

    id = Column(Integer, primary_key=True, index=True)
    # NULL for aggregate events (e.g. the daily "trending" card) that belong to
    # no single user. SET NULL on delete so a departed user's events don't 500.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(20), nullable=False)
    # Only whitelisted keys land here (see record_event's ALLOWED_PAYLOAD_KEYS):
    # tone, gender, age_range, author, emotion, themes, monologue_id, title,
    # source_type, line_count, milestone_n, reader_count. No raw query text, ever.
    payload = Column(JSONB, nullable=False, server_default=sql_text("'{}'::jsonb"))
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        # The feed read is a single created_at DESC scan — this is the index it rides.
        Index("ix_community_events_created_at", created_at.desc()),
        Index("ix_community_events_user_id", "user_id"),
    )
