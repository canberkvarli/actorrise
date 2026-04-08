"""
Persistent do-not-contact list for marketing emails.

Any email present here is auto-skipped by bulk and campaign sends so that
moderators can permanently exclude friends, test accounts, etc. without
having to remember to delete them from every paste.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy import text as sql_text

from app.core.database import Base


class EmailDoNotContact(Base):
    """An email address that should never receive marketing campaigns."""

    __tablename__ = "email_do_not_contact"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=True)
    reason = Column(String, nullable=True)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    added_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
