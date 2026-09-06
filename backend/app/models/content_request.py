"""Content requests - tracks plays/authors users want but we don't have."""

from datetime import datetime

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String
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


class ContentRequestRequester(Base):
    """Who asked for a title, so they can be told when it lands.

    `content_requests` deliberately dedupes by (title, author) and only counts
    presses, which means it has never recorded WHO pressed. That made "tell the
    actor who asked" impossible: the demand was known, the person was not.

    Deliberately thin. A request id, a user, when they asked, and whether they
    have since been told. Nothing about the search itself belongs here -- the
    consent this table represents is "I asked you for this", not "you may keep
    my search history".
    """

    __tablename__ = "content_request_requesters"

    id = Column(Integer, primary_key=True, index=True)
    content_request_id = Column(
        Integer,
        ForeignKey("content_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at = Column(DateTime, server_default=sql_text("(now())"), nullable=False)
    #: Set when the "it is up now" email is actually sent, so a second tap on a
    #: request offers only the people who have not been told yet.
    notified_at = Column(DateTime, nullable=True)

    __table_args__ = (
        # One row per person per request. A repeat press must not queue a
        # second email to the same actor.
        Index(
            "ix_content_request_requesters_unique",
            "content_request_id",
            "user_id",
            unique=True,
        ),
        Index("ix_content_request_requesters_user", "user_id"),
    )


def record_requester(
    db: Session, content_request_id: int, user_id: int | None
) -> None:
    """Link a user to a request they pressed track on. Idempotent.

    Anonymous searches pass user_id=None and are simply not recorded: there is
    nobody to write to. Never raises into the request path -- failing to note
    who asked must not fail the ask itself.
    """
    if not user_id:
        return
    exists = (
        db.query(ContentRequestRequester)
        .filter(
            ContentRequestRequester.content_request_id == content_request_id,
            ContentRequestRequester.user_id == user_id,
        )
        .first()
    )
    if exists:
        return
    db.add(
        ContentRequestRequester(
            content_request_id=content_request_id, user_id=user_id
        )
    )
    db.commit()


def upsert_content_request(
    db: Session,
    title: str,
    author: str | None = None,
    character_name: str | None = None,
    user_id: int | None = None,
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
    record_requester(db, row.id, user_id)
    return row
