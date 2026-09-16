"""
Email batch and per-send tracking models.

Tracks bulk/campaign email operations and individual send status
including delivery, opens, clicks via Resend webhooks.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class EmailBatch(Base):
    """Tracks a bulk or campaign email operation."""

    __tablename__ = "email_batches"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(String, nullable=False)
    campaign_key = Column(String, nullable=True, index=True)
    subject = Column(String)
    status = Column(String, default="pending")  # pending | processing | completed | failed
    total = Column(Integer, default=0)
    sent = Column(Integer, default=0)
    skipped = Column(Integer, default=0)
    errors_json = Column(JSONB, default=[])
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text("now()"))

    sends = relationship("EmailSend", back_populates="batch")


class EmailSend(Base):
    """Tracks an individual email send within a batch."""

    __tablename__ = "email_sends"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("email_batches.id"), nullable=False, index=True)
    resend_email_id = Column(String, nullable=True, index=True)
    to_email = Column(String, nullable=False, index=True)
    to_name = Column(String, default="")
    # queued | sending | sent | delivered | opened | clicked | bounced | failed
    #
    # "sending" is a claim, not a result: a worker flips rows to it in one
    # atomic UPDATE before it starts, so a second concurrent resume finds
    # nothing to take and cannot mail the same person twice.
    status = Column(String, default="queued")
    # When the claim was taken. A worker that dies mid-batch leaves rows in
    # "sending" forever, and a state that resume ignores is how recipients go
    # missing, so a claim older than STALE_CLAIM_MINUTES is reclaimable.
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    clicked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    batch = relationship("EmailBatch", back_populates="sends")
