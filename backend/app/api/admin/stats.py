"""
Admin stats/dashboard API for moderators.

Returns aggregated analytics: signups, feedback, monologue submissions, usage.
Protected by require_moderator. Supports optional date range (from/to).
"""

from datetime import date, timedelta
from typing import Any, Optional

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.billing import UsageMetrics
from app.models.feedback import ResultFeedback
from app.models.moderation import MonologueSubmission
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast, func, text as sql_text
from sqlalchemy.orm import Session
from sqlalchemy.sql.functions import count as sql_count

router = APIRouter(prefix="/api/admin", tags=["admin", "stats"])


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    """Ensure user is a moderator."""
    if current_user.is_moderator is not True:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


def _parse_date_range(
    from_param: Optional[str] = None,
    to_param: Optional[str] = None,
    default_days: int = 30,
) -> tuple[date, date]:
    """Parse from/to ISO date strings; default to last default_days."""
    today = date.today()
    if to_param:
        try:
            to_date = date.fromisoformat(to_param)
        except ValueError:
            to_date = today
    else:
        to_date = today
    if from_param:
        try:
            from_date = date.fromisoformat(from_param)
        except ValueError:
            from_date = to_date - timedelta(days=default_days)
    else:
        from_date = to_date - timedelta(days=default_days)
    if from_date > to_date:
        from_date = to_date
    return from_date, to_date


@router.get("/stats")
def get_admin_stats(
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
    from_date: Optional[str] = Query(None, alias="from", description="Start date (ISO)"),
    to_date: Optional[str] = Query(None, alias="to", description="End date (ISO)"),
) -> dict[str, Any]:
    """
    Get dashboard stats for the given date range (default last 30 days).
    Signups, feedback, submissions, and usage aggregates with time series.
    """
    from_d, to_d = _parse_date_range(from_date, to_date)

    # Build date series for filling gaps (inclusive)
    days_count = (to_d - from_d).days + 1
    date_list = [from_d + timedelta(days=i) for i in range(days_count)]

    # --- Signups ---
    # Total users (all time)
    total_users = db.query(User).count()
    # Signups by day in range (cast created_at to date for grouping)
    signups_by_day_q = (
        db.query(cast(User.created_at, Date).label("d"), sql_count(User.id).label("c"))
        .filter(
            cast(User.created_at, Date) >= from_d,
            cast(User.created_at, Date) <= to_d,
        )
        .group_by(cast(User.created_at, Date))
    )
    signups_by_day_map = {row.d: row.c for row in signups_by_day_q}
    signups_by_day = [{"date": d.isoformat(), "count": signups_by_day_map.get(d, 0)} for d in date_list]

    # --- Feedback ---
    total_positive = db.query(ResultFeedback).filter(ResultFeedback.rating == "positive").count()
    total_negative = db.query(ResultFeedback).filter(ResultFeedback.rating == "negative").count()
    feedback_by_day_q = (
        db.query(
            cast(ResultFeedback.created_at, Date).label("d"),
            ResultFeedback.rating,
            sql_count(ResultFeedback.id).label("c"),
        )
        .filter(
            cast(ResultFeedback.created_at, Date) >= from_d,
            cast(ResultFeedback.created_at, Date) <= to_d,
        )
        .group_by(cast(ResultFeedback.created_at, Date), ResultFeedback.rating)
    )
    feedback_by_day_map: dict[date, dict[str, int]] = {d: {"positive": 0, "negative": 0} for d in date_list}
    for row in feedback_by_day_q:
        if row.d not in feedback_by_day_map:
            feedback_by_day_map[row.d] = {"positive": 0, "negative": 0}
        feedback_by_day_map[row.d][row.rating] = row.c
    feedback_by_day = [
        {
            "date": d.isoformat(),
            "positive": feedback_by_day_map.get(d, {}).get("positive", 0),
            "negative": feedback_by_day_map.get(d, {}).get("negative", 0),
        }
        for d in date_list
    ]

    # --- Submissions ---
    submission_counts: dict[str, int] = {}
    for status in ("pending", "ai_review", "manual_review", "approved", "rejected"):
        submission_counts[status] = db.query(MonologueSubmission).filter(
            MonologueSubmission.status == status
        ).count()
    submissions_by_day_q = (
        db.query(
            cast(MonologueSubmission.submitted_at, Date).label("d"),
            sql_count(MonologueSubmission.id).label("c"),
        )
        .filter(
            cast(MonologueSubmission.submitted_at, Date) >= from_d,
            cast(MonologueSubmission.submitted_at, Date) <= to_d,
        )
        .group_by(cast(MonologueSubmission.submitted_at, Date))
    )
    submissions_by_day_map = {row.d: row.c for row in submissions_by_day_q}
    submissions_by_day = [{"date": d.isoformat(), "count": submissions_by_day_map.get(d, 0)} for d in date_list]

    # Approved/rejected today (for summary cards)
    today = date.today()
    approved_today = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == "approved",
        cast(MonologueSubmission.processed_at, Date) == today,
    ).count()
    rejected_today = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == "rejected",
        cast(MonologueSubmission.processed_at, Date) == today,
    ).count()

    # --- Usage (optional aggregates in range) ---
    usage_q = (
        db.query(
            func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0).label("ai_searches"),
            func.coalesce(func.sum(UsageMetrics.scene_partner_sessions), 0).label("scene_partner"),
            func.coalesce(func.sum(UsageMetrics.craft_coach_sessions), 0).label("craft_coach"),
        )
        .filter(
            UsageMetrics.date >= from_d,
            UsageMetrics.date <= to_d,
        )
    )
    usage_row = usage_q.first()
    usage: dict[str, int]
    if usage_row is None:
        usage = {
            "ai_searches": 0,
            "scene_partner_sessions": 0,
            "craft_coach_sessions": 0,
        }
    else:
        usage = {
            "ai_searches": int(usage_row.ai_searches or 0),
            "scene_partner_sessions": int(usage_row.scene_partner or 0),
            "craft_coach_sessions": int(usage_row.craft_coach or 0),
        }

    # All-time searches (monologue + film/TV + …) for admin overview; fallback to ai_searches if column not migrated
    try:
        alltime_searches = int(
            db.query(func.coalesce(func.sum(UsageMetrics.total_searches_count), 0)).scalar() or 0
        )
    except Exception:
        alltime_searches = int(
            db.query(func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0)).scalar() or 0
        )
    usage["alltime_searches"] = alltime_searches

    return {
        "from": from_d.isoformat(),
        "to": to_d.isoformat(),
        "signups": {
            "total_users": total_users,
            "by_day": signups_by_day,
        },
        "feedback": {
            "total_positive": total_positive,
            "total_negative": total_negative,
            "by_day": feedback_by_day,
        },
        "submissions": {
            "by_status": submission_counts,
            "by_day": submissions_by_day,
            "approved_today": approved_today,
            "rejected_today": rejected_today,
        },
        "usage": usage,
    }


# ── DB size limit (Supabase free tier) ─────────────────────────────────────────
_SUPABASE_FREE_LIMIT_MB = 500


@router.get("/health")
def get_system_health(
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    System health diagnostic: DB usage, AI cost estimate, table row counts.
    Designed to be called on-demand by the admin panel.
    """
    # ── DB table sizes ──────────────────────────────────────────────────────────
    size_rows = db.execute(sql_text("""
        SELECT
            relname                                           AS table_name,
            pg_size_pretty(pg_total_relation_size(c.oid))    AS size_pretty,
            pg_total_relation_size(c.oid)                    AS bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY bytes DESC
    """)).fetchall()

    total_bytes = sum(int(r[2]) for r in size_rows)
    total_mb = round(total_bytes / (1024 * 1024), 1)
    db_percent = round(total_mb / _SUPABASE_FREE_LIMIT_MB * 100, 1)

    if db_percent >= 90:
        db_status = "critical"
    elif db_percent >= 75:
        db_status = "warning"
    else:
        db_status = "healthy"

    tables = [
        {"name": r[0], "size_pretty": r[1], "bytes": int(r[2])}
        for r in size_rows
    ]

    # ── AI cost estimate ────────────────────────────────────────────────────────
    # Each AI search = 1 embedding call (text-embedding-3-small) ≈ $0.00002
    # Pull total ai_searches from UsageMetrics for current calendar month
    today = date.today()
    month_start = today.replace(day=1)
    monthly_ai = db.query(
        func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0)
    ).filter(UsageMetrics.date >= month_start).scalar() or 0
    monthly_ai = int(monthly_ai)
    estimated_cost_usd = round(monthly_ai * 0.00002, 4)

    # All-time total
    alltime_ai = int(db.query(
        func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0)
    ).scalar() or 0)

    # ── Row counts for key tables ───────────────────────────────────────────────
    from app.models.actor import FilmTvReference, Monologue  # local import to avoid circular
    monologue_count = db.query(func.count(Monologue.id)).scalar() or 0
    film_tv_count = db.query(func.count(FilmTvReference.id)).scalar() or 0

    return {
        "db": {
            "status": db_status,
            "total_mb": total_mb,
            "limit_mb": _SUPABASE_FREE_LIMIT_MB,
            "percent_used": db_percent,
            "tables": tables,
        },
        "ai_cost": {
            "monthly_searches": monthly_ai,
            "estimated_usd_this_month": estimated_cost_usd,
            "cost_per_search_usd": 0.00002,
            "alltime_searches": alltime_ai,
        },
        "content": {
            "monologue_rows": int(monologue_count),
            "film_tv_rows": int(film_tv_count),
        },
    }
