"""Admin search analytics API."""

from datetime import date, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Monologue, Play
from app.models.search_log import SearchLog
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast as sa_cast, desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "searches"])


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
    """Paginated search logs with summary stats."""

    end = date.fromisoformat(to_date) if to_date else date.today()
    start = date.fromisoformat(from_date) if from_date else end - timedelta(days=30)

    base = db.query(SearchLog).filter(
        sa_cast(SearchLog.created_at, Date) >= start,
        sa_cast(SearchLog.created_at, Date) <= end,
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
    user_map = {}
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

    # Summary stats for the date range
    summary_base = db.query(SearchLog).filter(
        sa_cast(SearchLog.created_at, Date) >= start,
        sa_cast(SearchLog.created_at, Date) <= end,
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
        "searches": searches,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": {
            "total_searches": total_searches,
            "zero_result_count": zero_results,
            "top_queries": [{"query": q, "count": c} for q, c in top_queries],
            "top_zero_result_queries": [{"query": q, "count": c} for q, c in top_zero],
        },
    }


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
