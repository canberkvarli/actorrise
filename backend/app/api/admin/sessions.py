"""Admin ScenePartner session analytics API."""

from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Play, RehearsalLineDelivery, RehearsalSession, Scene
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "sessions"])


def _date_range(from_date: Optional[str], to_date: Optional[str]) -> tuple[datetime, datetime]:
    """Resolve query date strings to a [start, end) datetime range. Avoids
    ``cast(..., Date)`` on the column, which prevents index use."""
    end_d = date.fromisoformat(to_date) if to_date else date.today()
    start_d = date.fromisoformat(from_date) if from_date else end_d - timedelta(days=30)
    return datetime.combine(start_d, time.min), datetime.combine(end_d + timedelta(days=1), time.min)


@router.get("/sessions")
def get_rehearsal_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(25, le=100),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    status: Optional[str] = Query(None, description="Filter by status: in_progress, completed, abandoned"),
    q: Optional[str] = Query(None, description="Filter by user email or scene title"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated rehearsal sessions with summary stats."""

    start_dt, end_dt = _date_range(from_date, to_date)

    base = (
        db.query(RehearsalSession)
        .filter(
            RehearsalSession.started_at >= start_dt,
            RehearsalSession.started_at < end_dt,
        )
    )

    if status:
        base = base.filter(RehearsalSession.status == status)

    # For text search, join user/scene
    if q:
        base = (
            base.join(User, RehearsalSession.user_id == User.id, isouter=True)
            .join(Scene, RehearsalSession.scene_id == Scene.id, isouter=True)
            .filter(
                User.email.ilike(f"%{q}%")
                | Scene.title.ilike(f"%{q}%")
            )
        )

    total = base.count()

    sessions = (
        base.order_by(desc(RehearsalSession.started_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Collect user emails and scene info
    user_ids = {s.user_id for s in sessions}
    scene_ids = {s.scene_id for s in sessions}

    user_map = {}
    if user_ids:
        users = db.query(User.id, User.email).filter(User.id.in_(user_ids)).all()
        user_map = {u.id: u.email for u in users}

    scene_map = {}
    if scene_ids:
        scenes = (
            db.query(Scene.id, Scene.title, Scene.character_1_name, Scene.character_2_name, Play.title.label("play_title"))
            .join(Play, Scene.play_id == Play.id)
            .filter(Scene.id.in_(scene_ids))
            .all()
        )
        scene_map = {
            s.id: {
                "title": s.title,
                "play_title": s.play_title,
                "character_1": s.character_1_name,
                "character_2": s.character_2_name,
            }
            for s in scenes
        }

    items = []
    for s in sessions:
        scene_info = scene_map.get(s.scene_id, {})
        items.append({
            "id": s.id,
            "user_email": user_map.get(s.user_id),
            "scene_title": scene_info.get("title", "Unknown"),
            "play_title": scene_info.get("play_title", "Unknown"),
            "character_1": scene_info.get("character_1"),
            "character_2": scene_info.get("character_2"),
            "user_character": s.user_character,
            "ai_character": s.ai_character,
            "status": s.status,
            "total_lines_delivered": s.total_lines_delivered,
            "lines_retried": s.lines_retried,
            "completion_percentage": s.completion_percentage,
            "overall_rating": s.overall_rating,
            "duration_seconds": s.duration_seconds,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        })

    # Summary aggregates are stable across pagination — only compute them
    # on page 1, then the frontend caches the value.
    summary: Optional[dict[str, Any]] = None
    if page == 1:
        summary_row = (
            db.query(
                func.count().label("total_sessions"),
                func.count().filter(RehearsalSession.status == "completed").label("completed"),
                func.count().filter(RehearsalSession.status == "abandoned").label("abandoned"),
                func.count().filter(RehearsalSession.status == "in_progress").label("in_progress"),
                func.avg(RehearsalSession.duration_seconds).filter(
                    RehearsalSession.duration_seconds.isnot(None)
                ).label("avg_duration"),
                func.avg(RehearsalSession.overall_rating).filter(
                    RehearsalSession.overall_rating.isnot(None)
                ).label("avg_rating"),
                func.avg(RehearsalSession.completion_percentage).filter(
                    RehearsalSession.status == "completed"
                ).label("avg_completion"),
            )
            .filter(
                RehearsalSession.started_at >= start_dt,
                RehearsalSession.started_at < end_dt,
            )
            .first()
        )

        top_scenes = (
            db.query(
                Scene.title.label("scene_title"),
                func.count().label("cnt"),
            )
            .join(RehearsalSession, RehearsalSession.scene_id == Scene.id)
            .filter(
                RehearsalSession.started_at >= start_dt,
                RehearsalSession.started_at < end_dt,
            )
            .group_by(Scene.title)
            .order_by(desc("cnt"))
            .limit(5)
            .all()
        )

        summary = {
            "total_sessions": summary_row.total_sessions if summary_row else 0,
            "completed": summary_row.completed if summary_row else 0,
            "abandoned": summary_row.abandoned if summary_row else 0,
            "in_progress": summary_row.in_progress if summary_row else 0,
            "avg_duration_seconds": round(summary_row.avg_duration) if summary_row and summary_row.avg_duration else None,
            "avg_rating": round(float(summary_row.avg_rating), 1) if summary_row and summary_row.avg_rating else None,
            "avg_completion": round(float(summary_row.avg_completion), 1) if summary_row and summary_row.avg_completion else None,
            "top_scenes": [{"scene": s, "count": c} for s, c in top_scenes],
        }

    return {
        "sessions": items,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary,
    }


@router.get("/sessions/analytics")
def get_session_analytics(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Aggregate rehearsal analytics: completion funnel, drop-off, per-scene, per-user."""
    start_dt, end_dt = _date_range(from_date, to_date)
    window = (
        RehearsalSession.started_at >= start_dt,
        RehearsalSession.started_at < end_dt,
    )

    # --- Funnel + completion rate ---
    f = (
        db.query(
            func.count().label("total"),
            func.count().filter(RehearsalSession.status == "completed").label("completed"),
            func.count().filter(RehearsalSession.status == "abandoned").label("abandoned"),
            func.count().filter(RehearsalSession.status == "in_progress").label("in_progress"),
            func.avg(RehearsalSession.duration_seconds).filter(
                RehearsalSession.duration_seconds.isnot(None)
            ).label("avg_duration"),
            func.avg(RehearsalSession.duration_seconds).filter(
                RehearsalSession.status == "completed",
                RehearsalSession.duration_seconds.isnot(None),
            ).label("avg_completed_duration"),
        )
        .filter(*window)
        .first()
    )
    completed = f.completed if f else 0
    abandoned = f.abandoned if f else 0
    ended = completed + abandoned
    completion_rate = round(completed / ended * 100, 1) if ended else None

    # --- Drop-off: abandoned sessions bucketed by how far they got ---
    abandoned_pcts = [
        float(p or 0.0)
        for (p,) in db.query(RehearsalSession.completion_percentage)
        .filter(*window, RehearsalSession.status == "abandoned")
        .all()
    ]
    buckets = [
        ("Quit immediately (0%)", lambda x: x <= 0),
        ("1-25%", lambda x: 0 < x <= 25),
        ("26-50%", lambda x: 25 < x <= 50),
        ("51-75%", lambda x: 50 < x <= 75),
        ("76-99%", lambda x: 75 < x < 100),
    ]
    dropoff = [
        {"bucket": label, "count": sum(1 for x in abandoned_pcts if test(x))}
        for label, test in buckets
    ]

    # --- Per-scene engagement ---
    scene_rows = (
        db.query(
            Scene.title.label("scene_title"),
            Play.title.label("play_title"),
            func.count().label("total"),
            func.count().filter(RehearsalSession.status == "completed").label("completed"),
            func.count().filter(RehearsalSession.status == "abandoned").label("abandoned"),
            func.count().filter(RehearsalSession.status == "in_progress").label("in_progress"),
            func.avg(RehearsalSession.duration_seconds).filter(
                RehearsalSession.duration_seconds.isnot(None)
            ).label("avg_duration"),
        )
        .join(Scene, RehearsalSession.scene_id == Scene.id)
        .join(Play, Scene.play_id == Play.id)
        .filter(*window)
        .group_by(Scene.title, Play.title)
        .order_by(desc("total"))
        .limit(10)
        .all()
    )
    by_scene = [
        {
            "scene_title": r.scene_title,
            "play_title": r.play_title,
            "total": r.total,
            "completed": r.completed,
            "abandoned": r.abandoned,
            "in_progress": r.in_progress,
            "completion_rate": round(r.completed / (r.completed + r.abandoned) * 100, 1)
            if (r.completed + r.abandoned) else None,
            "avg_duration_seconds": round(r.avg_duration) if r.avg_duration else None,
        }
        for r in scene_rows
    ]

    # --- Per-user activity / retention ---
    user_rows = (
        db.query(
            User.email.label("email"),
            func.count().label("total"),
            func.count().filter(RehearsalSession.status == "completed").label("completed"),
            func.count().filter(RehearsalSession.status == "abandoned").label("abandoned"),
            func.max(RehearsalSession.started_at).label("last_active"),
        )
        .join(User, RehearsalSession.user_id == User.id)
        .filter(*window)
        .group_by(User.email)
        .order_by(desc("total"))
        .limit(15)
        .all()
    )
    by_user = [
        {
            "email": r.email,
            "total": r.total,
            "completed": r.completed,
            "abandoned": r.abandoned,
            "completion_rate": round(r.completed / (r.completed + r.abandoned) * 100, 1)
            if (r.completed + r.abandoned) else None,
            "last_active": r.last_active.isoformat() if r.last_active else None,
        }
        for r in user_rows
    ]

    return {
        "funnel": {
            "total": f.total if f else 0,
            "completed": completed,
            "abandoned": abandoned,
            "in_progress": f.in_progress if f else 0,
            "completion_rate": completion_rate,
        },
        "avg_duration_seconds": round(f.avg_duration) if f and f.avg_duration else None,
        "avg_completed_duration_seconds": round(f.avg_completed_duration) if f and f.avg_completed_duration else None,
        "dropoff": dropoff,
        "by_scene": by_scene,
        "by_user": by_user,
    }


@router.get("/sessions/{session_id}/lines")
def get_session_line_deliveries(
    session_id: int,
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Get line deliveries for a specific rehearsal session."""
    from fastapi import HTTPException

    session = db.query(RehearsalSession).filter(RehearsalSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    lines = (
        db.query(RehearsalLineDelivery)
        .filter(RehearsalLineDelivery.session_id == session_id)
        .order_by(RehearsalLineDelivery.delivery_order)
        .all()
    )

    return {
        "overall_feedback": session.overall_feedback,
        "strengths": session.strengths,
        "areas_to_improve": session.areas_to_improve,
        "lines": [
            {
                "id": l.id,
                "delivery_order": l.delivery_order,
                "user_input": l.user_input,
                "ai_response": l.ai_response,
                "feedback": l.feedback,
                "emotion_detected": l.emotion_detected,
                "pacing_feedback": l.pacing_feedback,
                "was_retry": l.was_retry,
                "delivered_at": l.delivered_at.isoformat() if l.delivered_at else None,
            }
            for l in lines
        ],
    }
