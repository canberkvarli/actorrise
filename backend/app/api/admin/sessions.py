"""Admin ScenePartner session analytics API."""

from datetime import date, timedelta
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.actor import Play, RehearsalLineDelivery, RehearsalSession, Scene
from app.models.user import User
from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast as sa_cast, desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin", tags=["admin", "sessions"])


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

    end = date.fromisoformat(to_date) if to_date else date.today()
    start = date.fromisoformat(from_date) if from_date else end - timedelta(days=30)

    base = (
        db.query(RehearsalSession)
        .filter(
            sa_cast(RehearsalSession.started_at, Date) >= start,
            sa_cast(RehearsalSession.started_at, Date) <= end,
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

    # Summary stats — single aggregation query
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
            sa_cast(RehearsalSession.started_at, Date) >= start,
            sa_cast(RehearsalSession.started_at, Date) <= end,
        )
        .first()
    )

    # Top scenes by session count
    top_scenes = (
        db.query(
            Scene.title.label("scene_title"),
            func.count().label("cnt"),
        )
        .join(RehearsalSession, RehearsalSession.scene_id == Scene.id)
        .filter(
            sa_cast(RehearsalSession.started_at, Date) >= start,
            sa_cast(RehearsalSession.started_at, Date) <= end,
        )
        .group_by(Scene.title)
        .order_by(desc("cnt"))
        .limit(5)
        .all()
    )

    return {
        "sessions": items,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": {
            "total_sessions": summary_row.total_sessions if summary_row else 0,
            "completed": summary_row.completed if summary_row else 0,
            "abandoned": summary_row.abandoned if summary_row else 0,
            "in_progress": summary_row.in_progress if summary_row else 0,
            "avg_duration_seconds": round(summary_row.avg_duration) if summary_row and summary_row.avg_duration else None,
            "avg_rating": round(float(summary_row.avg_rating), 1) if summary_row and summary_row.avg_rating else None,
            "avg_completion": round(float(summary_row.avg_completion), 1) if summary_row and summary_row.avg_completion else None,
            "top_scenes": [{"scene": s, "count": c} for s, c in top_scenes],
        },
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
