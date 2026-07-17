"""Search analytics - logs every search query with filters and results."""

from app.core.database import Base
from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Index,
                        Integer, String, Text)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB


class SearchLog(Base):
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False)
    filters_used = Column(JSONB, nullable=True)
    results_count = Column(Integer, nullable=False, default=0)
    result_ids = Column(JSONB, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    source = Column(String(20), nullable=False, default="search")
    content_gap = Column(JSONB, nullable=True)  # {play: "...", author: "...", character: "..."}
    # Telemetry added after the 2026-07 audit (analytics could not tell a
    # pagination fetch from a new search, nor a weak result set from a strong one).
    page = Column(Integer, nullable=True)  # 1 = new search; >1 = pagination fetch
    weak_match = Column(Boolean, nullable=True)  # soft-fail banner shown
    best_cosine = Column(Float, nullable=True)  # best raw cosine of the result set
    created_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        Index("ix_search_logs_created_at", "created_at"),
        Index("ix_search_logs_user_id", "user_id"),
    )


class MonologueView(Base):
    """One row per monologue open (detail fetch) — the missing funnel event
    between search and favorite/rehearse. search_log_id links the open back to
    the search that produced it when the client passes ?slid=."""

    __tablename__ = "monologue_views"

    id = Column(Integer, primary_key=True, index=True)
    monologue_id = Column(Integer, ForeignKey("monologues.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    search_log_id = Column(Integer, ForeignKey("search_logs.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        Index("ix_monologue_views_created_at", "created_at"),
        Index("ix_monologue_views_user_id", "user_id"),
        Index("ix_monologue_views_monologue_id", "monologue_id"),
    )
