"""The Book's lists, and the speech Ghost Light chose for each actor tonight.

Lists are the actor's own grouping of what they keep: "Classical, women",
"For my agent", "Class, week 4". A speech can sit in any number of them, and
so can a script of their own sides. An audition is not a list here; it keeps
its own table and its own pieces (audition_pieces), and the app draws it as a
list with a date on it.

A list item never owns the speech. Taking a speech out of the Book hides it
from every list rather than deleting the rows, so the Book's five-second undo
puts it back where it was.
"""

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class BookList(Base):
    __tablename__ = "book_lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(80), nullable=False)
    position = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class BookListItem(Base):
    __tablename__ = "book_list_items"
    __table_args__ = (
        UniqueConstraint("list_id", "monologue_id", name="uq_book_list_monologue"),
        UniqueConstraint("list_id", "user_script_id", name="uq_book_list_script"),
    )

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("book_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    # Exactly one of the two.
    monologue_id = Column(Integer, ForeignKey("monologues.id", ondelete="CASCADE"), nullable=True, index=True)
    user_script_id = Column(Integer, ForeignKey("user_scripts.id", ondelete="CASCADE"), nullable=True, index=True)
    position = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TonightPick(Base):
    """One actor's speech for one night in one house, chosen once and kept.

    Stored rather than recomputed so the pick cannot change under the actor
    during the day (their Book changes, the pool's popularity moves), so the
    read wall can tell tonight's speech from any other, and so "Not for me"
    has somewhere to live and shape the next night's.
    """

    __tablename__ = "tonight_picks"
    __table_args__ = (UniqueConstraint("user_id", "day", "house", name="uq_tonight_pick_day"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    day = Column(Date, nullable=False)
    house = Column(String(8), nullable=False)
    monologue_id = Column(Integer, ForeignKey("monologues.id", ondelete="CASCADE"), nullable=False)
    #: None until the actor says: "keep" or "pass".
    answer = Column(String(8), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class BookListShare(Base):
    """A list sent to someone: an agent, a teacher. The link carries a token,
    never the list's id, and opens a page with the titles, the plays and the
    running times: never a speech's words. Taking the share back kills the link.
    """

    __tablename__ = "book_list_shares"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("book_lists.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    token = Column(String(32), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
