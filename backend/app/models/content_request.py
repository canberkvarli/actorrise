"""Content requests - tracks plays/authors users want but we don't have."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy import text as sql_text


class ContentRequest(Base):
    __tablename__ = "content_requests"

    id = Column(Integer, primary_key=True, index=True)
    play_title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    character_name = Column(String, nullable=True)
    request_count = Column(Integer, nullable=False, default=1)
    first_requested_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)
    last_requested_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)
    status = Column(String(20), nullable=False, default="requested")

    __table_args__ = (
        Index("ix_content_requests_play_author", "play_title", "author", unique=True),
    )
