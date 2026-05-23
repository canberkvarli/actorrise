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
from sqlalchemy import desc, func
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

    total_searches = summary_base.count()
    zero_results = summary_base.filter(SearchLog.results_count == 0).count()

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
