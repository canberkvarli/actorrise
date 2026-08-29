"""Admin search analytics API."""

from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue, Play
from app.models.content_request import ContentRequest
from app.models.search_log import SearchLog
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, func, text as sa_text
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "searches"])


def _date_range(from_date: Optional[str], to_date: Optional[str]) -> tuple[datetime, datetime]:
    """Resolve query date strings to a [start, end) datetime range usable
    directly against ``SearchLog.created_at``. Avoids ``cast(..., Date)``
    on the column, which prevents index usage in Postgres."""
    end_d = date.fromisoformat(to_date) if to_date else date.today()
    start_d = date.fromisoformat(from_date) if from_date else end_d - timedelta(days=30)
    start_dt = datetime.combine(start_d, time.min)
    end_dt = datetime.combine(end_d + timedelta(days=1), time.min)
    return start_dt, end_dt


def _compute_summary(start_dt: datetime, end_dt: datetime, db: Session) -> dict[str, Any]:
    """Run the four summary aggregates over the date range. Date filter
    uses raw ``created_at`` comparisons so any (created_at) index can be
    used by the planner."""
    summary_base = db.query(SearchLog).filter(
        SearchLog.created_at >= start_dt,
        SearchLog.created_at < end_dt,
    )

    # The five headline aggregates in ONE index scan / ONE round trip instead of
    # five. On a single-worker backend talking to Supabase, each avoided round
    # trip is real wall-clock — this endpoint was doing ~10 sequential queries,
    # wide enough that a deploy restart mid-request dropped the whole page.
    totals = db.execute(
        sa_text(
            "SELECT count(*) AS total, "
            "count(*) FILTER (WHERE results_count = 0) AS zero, "
            "count(*) FILTER (WHERE weak_match IS TRUE) AS weak, "
            # content_gap is jsonb: a real gap is an object; most rows store the
            # jsonb literal 'null' (NOT sql NULL), so IS NOT NULL over-counts.
            "count(*) FILTER (WHERE jsonb_typeof(content_gap) = 'object') AS gaps, "
            "avg(best_cosine) FILTER (WHERE best_cosine IS NOT NULL) AS avg_cos, "
            # The weak-rate denominator must be the SCOREABLE (vector) rows only.
            # Title/character pre-pass hits never set weak_match or best_cosine,
            # so counting them dilutes the rate (33.2% reported vs 41.9% real).
            "count(*) FILTER (WHERE best_cosine IS NOT NULL) AS scoreable, "
            "count(*) FILTER (WHERE match_strategy IN "
            "  ('title_exact','title_exact_backfilled','character_exact','character_exact_backfilled')"
            ") AS title_lookup, "
            # Silent-retry signal: the stored is_repeat flag (same user re-ran an
            # identical query within 10 min). Set at write time, backfilled once.
            "count(*) FILTER (WHERE is_repeat IS TRUE) AS repeats "
            "FROM search_logs WHERE created_at >= :start AND created_at < :end"
        ),
        {"start": start_dt, "end": end_dt},
    ).fetchone()
    total_searches = int(totals[0] or 0)
    zero_results = int(totals[1] or 0)
    weak_matches = int(totals[2] or 0)
    content_gaps = int(totals[3] or 0)
    avg_cosine = totals[4]
    scoreable = int(totals[5] or 0)
    title_lookup_count = int(totals[6] or 0)
    repeat_count = int(totals[7] or 0)

    def _distribution(column):
        rows = (
            summary_base.with_entities(column.label("k"), func.count().label("cnt"))
            .filter(column.isnot(None))
            .group_by(column)
            .order_by(desc("cnt"))
            .all()
        )
        return [{"key": k, "count": c} for k, c in rows]

    by_match_strategy = _distribution(SearchLog.match_strategy)
    by_query_type = _distribution(SearchLog.query_type)

    # Retry signal (H-13): the same normalised query issued 3+ times by one user
    # inside a 30-min window — the strongest dissatisfaction indicator we have.
    # search_logs has no session_id, so a 30-min epoch bucket stands in for a
    # session. Raw SQL: the group-by-then-count-groups shape is awkward in ORM.
    retry = db.execute(
        sa_text(
            "SELECT count(*) AS events, count(DISTINCT user_id) AS users FROM ("
            "  SELECT user_id FROM search_logs"
            "  WHERE created_at >= :start AND created_at < :end AND user_id IS NOT NULL"
            "  GROUP BY user_id, lower(btrim(query)), floor(extract(epoch from created_at)/1800)"
            "  HAVING count(*) >= 3"
            ") r"
        ),
        {"start": start_dt, "end": end_dt},
    ).fetchone()
    retry_events = int(retry[0] or 0) if retry else 0
    retry_users = int(retry[1] or 0) if retry else 0

    top_queries = (
        summary_base
        .with_entities(
            func.lower(SearchLog.query).label("q"),
            func.count().label("cnt"),
        )
        .group_by(func.lower(SearchLog.query))
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )

    top_zero = (
        summary_base
        .filter(SearchLog.results_count == 0)
        .with_entities(
            func.lower(SearchLog.query).label("q"),
            func.count().label("cnt"),
        )
        .group_by(func.lower(SearchLog.query))
        .order_by(desc("cnt"))
        .limit(10)
        .all()
    )

    return {
        "total_searches": total_searches,
        "zero_result_count": zero_results,
        "weak_match_count": weak_matches,
        # Rate over SCOREABLE (vector) searches only — title/character lookups
        # can never be weak, so including them understated the true failure rate.
        "weak_match_rate": round(weak_matches / scoreable * 100, 1) if scoreable else 0.0,
        "scoreable_count": scoreable,
        "title_lookup_count": title_lookup_count,
        "content_gap_count": content_gaps,
        "avg_best_cosine": round(float(avg_cosine), 3) if avg_cosine is not None else None,
        "by_match_strategy": by_match_strategy,
        "by_query_type": by_query_type,
        "retry_events": retry_events,
        "retry_users": retry_users,
        "repeat_count": repeat_count,
        "repeat_rate": round(repeat_count / total_searches * 100, 1) if total_searches else 0.0,
        "top_queries": [{"query": q, "count": c} for q, c in top_queries],
        "top_zero_result_queries": [{"query": q, "count": c} for q, c in top_zero],
    }


@router.get("/searches")
def get_search_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, le=100),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    zero_only: bool = Query(False, description="Only show zero-result searches"),
    source: Optional[str] = Query(None, description="Filter by source: search or demo"),
    q: Optional[str] = Query(None, description="Filter by query text"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated search logs only — summary stats moved to ``/searches/summary``
    so paginating doesn't re-compute heavy aggregates each time."""

    start_dt, end_dt = _date_range(from_date, to_date)

    base = db.query(SearchLog).filter(
        SearchLog.created_at >= start_dt,
        SearchLog.created_at < end_dt,
    )

    if zero_only:
        base = base.filter(SearchLog.results_count == 0)
    if source:
        base = base.filter(SearchLog.source == source)
    if q:
        base = base.filter(SearchLog.query.ilike(f"%{q}%"))

    total = base.count()

    logs = (
        base.order_by(desc(SearchLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Collect user emails for display
    user_ids = {log.user_id for log in logs if log.user_id}
    user_map: dict = {}
    if user_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.email for u in users}

    searches = [
        {
            "id": log.id,
            "query": log.query,
            "filters_used": log.filters_used,
            "results_count": log.results_count,
            "result_ids": log.result_ids,
            "user_email": user_map.get(log.user_id),
            "source": log.source,
            "weak_match": log.weak_match,
            "best_cosine": round(float(log.best_cosine), 3) if log.best_cosine is not None else None,
            "match_strategy": log.match_strategy,
            "query_type": log.query_type,
            "content_gap": log.content_gap,
            "is_repeat": log.is_repeat,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]

    # Summary only on page 1 — paginating doesn't change the aggregate,
    # so we save four COUNT/GROUP BY scans per page-change.
    summary = _compute_summary(start_dt, end_dt, db) if page == 1 else None

    return {
        "searches": searches,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary,
    }


@router.get("/searches/summary")
def get_search_logs_summary(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Dedicated summary endpoint. Same payload as the embedded `summary`
    in `/searches?page=1` — frontend can call this directly when it wants
    fresh aggregates without re-fetching the paginated rows."""
    start_dt, end_dt = _date_range(from_date, to_date)
    return _compute_summary(start_dt, end_dt, db)


@router.get("/searches/{log_id}/results")
def get_search_result_monologues(
    log_id: int,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Get monologue snapshots for a specific search log entry."""
    from fastapi import HTTPException

    log = db.query(SearchLog).filter(SearchLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Search log not found")

    if not log.result_ids:
        return {"monologues": []}

    monologues = (
        db.query(
            Monologue.id,
            Monologue.title,
            Monologue.character_name,
            Monologue.character_gender,
            Monologue.character_age_range,
            Monologue.primary_emotion,
            Monologue.estimated_duration_seconds,
            Monologue.word_count,
            Play.title.label("play_title"),
            Play.author,
        )
        .join(Play)
        .filter(Monologue.id.in_(log.result_ids))
        .all()
    )

    return {
        "monologues": [
            {
                "id": m.id,
                "title": m.title,
                "character_name": m.character_name,
                "gender": m.character_gender,
                "age_range": m.character_age_range,
                "emotion": m.primary_emotion,
                "duration_seconds": m.estimated_duration_seconds,
                "word_count": m.word_count,
                "play_title": m.play_title,
                "author": m.author,
            }
            for m in monologues
        ],
    }


# ── Content Requests ──────────────────────────────────────────────────────────


@router.get("/content-requests")
def get_content_requests(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """All content requests sorted by most requested."""
    requests = (
        db.query(ContentRequest)
        .order_by(desc(ContentRequest.request_count))
        .all()
    )
    return {
        "requests": [
            {
                "id": r.id,
                "play_title": r.play_title,
                "author": r.author,
                "character_name": r.character_name,
                "request_count": r.request_count,
                "first_requested_at": r.first_requested_at.isoformat(),
                "last_requested_at": r.last_requested_at.isoformat(),
                "status": r.status,
            }
            for r in requests
        ],
    }


class ContentRequestStatusUpdate(BaseModel):
    status: str  # "requested" | "planned" | "added"


@router.patch("/content-requests/{request_id}")
def update_content_request_status(
    request_id: int,
    body: ContentRequestStatusUpdate,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, str]:
    """Update a content request's status."""
    req = db.query(ContentRequest).filter(ContentRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Content request not found")
    if body.status not in ("requested", "planned", "added"):
        raise HTTPException(status_code=400, detail="Status must be requested, planned, or added")
    req.status = body.status
    db.commit()
    return {"status": "ok"}
