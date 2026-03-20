"""Search analytics - logs every search query with filters and results."""

from app.core.database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
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
    created_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        Index("ix_search_logs_created_at", "created_at"),
        Index("ix_search_logs_user_id", "user_id"),
    )
