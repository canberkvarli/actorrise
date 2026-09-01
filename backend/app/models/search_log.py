"""Search analytics - logs every search query with filters and results."""

from app.core.database import Base
from sqlalchemy import (Boolean, Column, DateTime, Float, ForeignKey, Index,
                        Integer, String, Text)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB


def compute_is_repeat(db, user_id, query):
    """True when this (user, normalized query) was already searched in the last
    10 minutes — the silent-retry signal, set on the row at write time.

    Returns None for anonymous searches (no session to compare against). Cheap:
    an EXISTS on the (user_id) index bounded by created_at. Never raises — a
    telemetry flag must not be able to break a search — so any failure (or a
    SQLite test backend without now()/btrim) degrades to None.
    """
    if not user_id or not query or not (query or "").strip():
        return None
    try:
        return bool(
            db.execute(
                sql_text(
                    "SELECT EXISTS (SELECT 1 FROM search_logs "
                    "WHERE user_id = :uid "
                    "AND lower(btrim(query)) = lower(btrim(:q)) "
                    "AND created_at >= now() - interval '10 minutes')"
                ),
                {"uid": user_id, "q": query},
            ).scalar()
        )
    except Exception:
        return None


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
    # What KIND of thing was asked for: title | named_lookup | occupation |
    # attribute | multi | other. Classified on the logging path only — nothing
    # reads it back into ranking. See app/services/search/query_type.py.
    # NOT NULL with a server default rather than a bare NOT NULL: an insert
    # site that forgets this must degrade to 'other', never fail a search.
    # Sealed by scripts/backfill_search_query_type.py once no NULLs remain.
    query_type = Column(
        String(20), nullable=False, server_default=sql_text("'other'")
    )
    # Which retrieval branch answered this search:
    #   title_exact             the query named a show we carry; its pieces were
    #                           returned directly, no vector query run
    #   title_exact_backfilled  same, but the show had fewer pieces than a page,
    #                           so vector results were appended behind them
    #   vector                  the normal semantic path
    # Added 2026-08-20 to measure the split, since H-07 predicts the title
    # branch should absorb roughly a third of weak matches.
    match_strategy = Column(String(24), nullable=True)
    # True when this same (user, normalized query) was searched within the last
    # 10 minutes — the silent-retry / dissatisfaction signal (weak_match misses
    # it entirely). NULL for anonymous searches, which have no session to compare
    # against. Set at write time by log_search_row(); see H-17.
    is_repeat = Column(Boolean, nullable=True)
    # Parenthesised like ContentRequest's: valid Postgres either way, and the
    # bare form is a DDL syntax error on SQLite, which the tests build this
    # table on. Prod columns are created by hand-written migration scripts, so
    # this affects generated DDL only.
    created_at = Column(DateTime, server_default=sql_text("(now())"), nullable=False)

    __table_args__ = (
        Index("ix_search_logs_created_at", "created_at"),
        Index("ix_search_logs_user_id", "user_id"),
        Index("ix_search_logs_query_type", "query_type", "created_at"),
        Index("ix_search_logs_match_strategy", "match_strategy", "created_at"),
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
    # Which client opened the piece: "web" or "ghostlight". The free-read wall
    # is a SEPARATE trial per client (web 5 a month, Ghost Light 3 for life), so
    # the count has to know where the read happened or the two allowances pool
    # and an actor who read on the web arrives in the app already walled.
    #
    # Nullable, and NULL reads as web. Every row written before 2026-09-01 came
    # from the web detail page — the app's own path is POST /{id}/read — so
    # backfilling them to "web" would be guesswork dressed as data, while
    # treating NULL as web is the same answer without the pretence. It also
    # means Ghost Light's lifetime trial starts at zero for everyone, which is
    # what a trial that has never been offered before should do.
    client = Column(String(16), nullable=True)
    created_at = Column(DateTime, server_default=sql_text("now()"), nullable=False)

    __table_args__ = (
        Index("ix_monologue_views_created_at", "created_at"),
        Index("ix_monologue_views_user_id", "user_id"),
        Index("ix_monologue_views_monologue_id", "monologue_id"),
        # The wall's query is "distinct pieces for this user on this client",
        # and it runs on every detail open, so it must not scan the user's
        # whole history to answer.
        Index("ix_monologue_views_user_client", "user_id", "client"),
    )
