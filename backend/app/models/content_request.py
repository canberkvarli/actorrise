"""Content requests - tracks plays/authors users want but we don't have."""

from datetime import datetime

from app.core.database import Base
from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy import func
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session


class ContentRequest(Base):
    __tablename__ = "content_requests"

    id = Column(Integer, primary_key=True, index=True)
    play_title = Column(String, nullable=False)
    author = Column(String, nullable=True)
    character_name = Column(String, nullable=True)
    request_count = Column(Integer, nullable=False, default=1)
    first_requested_at = Column(DateTime, server_default=sql_text("(now())"), nullable=False)
    last_requested_at = Column(DateTime, server_default=sql_text("(now())"), nullable=False)
    status = Column(String(20), nullable=False, default="requested")

    __table_args__ = (
        Index("ix_content_requests_play_author", "play_title", "author", unique=True),
    )


def upsert_content_request(
    db: Session,
    title: str,
    author: str | None = None,
    character_name: str | None = None,
) -> "ContentRequest":
    """Record a content request, deduped by (title, author).

    A first request inserts a row; repeats bump ``request_count`` and stamp
    ``last_requested_at`` rather than piling up duplicate rows — so the admin
    queue ranks by real demand. ``title`` may be a play title or a raw search
    string; callers pass whichever they have. Commits and returns the row.
    """
    title = (title or "").strip()
    author = author.strip() if author else None
    existing = (
        db.query(ContentRequest)
        .filter(
            func.lower(ContentRequest.play_title) == title.lower(),
            func.lower(func.coalesce(ContentRequest.author, "")) == (author or "").lower(),
        )
        .first()
    )
    if existing:
        existing.request_count += 1
        existing.last_requested_at = datetime.utcnow()
        row = existing
    else:
        row = ContentRequest(
            play_title=title,
            author=author,
            character_name=character_name.strip() if character_name else None,
        )
        db.add(row)
    db.commit()
    return row
