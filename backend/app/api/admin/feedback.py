"""Admin feedback inbox.

The founder-facing half of the feedback loop: negative feedback with a written
note is emailed on arrival (see app/api/feedback.py) AND listed here so it can be
worked through and marked read. `read_at` drives the unread badge in the nav.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.feedback import ResultFeedback
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/feedback", tags=["admin", "feedback"])


def _scene_meta(comment: str | None) -> tuple[Optional[dict], str]:
    """Scene-extraction comments are stored as "[script=..,scene=..,cat=..] text".
    Split the structured prefix out so the UI can show it cleanly."""
    if not comment or not comment.startswith("["):
        return None, (comment or "")
    end = comment.find("]")
    if end == -1:
        return None, comment
    meta: dict = {}
    for pair in comment[1:end].split(","):
        if "=" in pair:
            k, v = pair.split("=", 1)
            meta[k.strip()] = v.strip()
    return meta, comment[end + 1:].strip()


@router.get("")
def list_feedback(
    rating: str = Query("negative", description="negative | positive | all"),
    context: Optional[str] = Query(None, description="Filter by context"),
    unread_only: bool = Query(False),
    with_comment: bool = Query(True, description="Only rows that have free-text"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Paginated feedback, newest first. Defaults to the actionable slice:
    negative feedback that carries a written note."""
    base = db.query(ResultFeedback)
    if rating in ("negative", "positive"):
        base = base.filter(ResultFeedback.rating == rating)
    if context:
        base = base.filter(ResultFeedback.context == context)
    if unread_only:
        base = base.filter(ResultFeedback.read_at.is_(None))
    if with_comment:
        base = base.filter(
            ResultFeedback.comment.isnot(None), func.trim(ResultFeedback.comment) != ""
        )

    total = base.count()
    rows = (
        base.order_by(desc(ResultFeedback.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    user_ids = {r.user_id for r in rows if r.user_id}
    user_map: dict = {}
    if user_ids:
        for uid, email in db.query(User.id, User.email).filter(User.id.in_(user_ids)).all():
            user_map[uid] = email

    items = []
    for r in rows:
        meta, text = _scene_meta(r.comment)
        items.append({
            "id": r.id,
            "context": r.context,
            "rating": r.rating,
            "comment": text,
            "scene_meta": meta,
            "user_email": user_map.get(r.user_id),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "read_at": r.read_at.isoformat() if r.read_at else None,
        })

    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/summary")
def feedback_summary(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Counts for the badge + header. `unread` = negative, has-comment, never read."""
    has_comment = (ResultFeedback.comment.isnot(None), func.trim(ResultFeedback.comment) != "")

    unread = (
        db.query(func.count(ResultFeedback.id))
        .filter(ResultFeedback.rating == "negative", ResultFeedback.read_at.is_(None), *has_comment)
        .scalar()
        or 0
    )
    total_negative = (
        db.query(func.count(ResultFeedback.id))
        .filter(ResultFeedback.rating == "negative", *has_comment)
        .scalar()
        or 0
    )
    by_context = (
        db.query(ResultFeedback.context, func.count(ResultFeedback.id))
        .filter(ResultFeedback.rating == "negative", *has_comment)
        .group_by(ResultFeedback.context)
        .all()
    )
    return {
        "unread": int(unread),
        "total_negative": int(total_negative),
        "by_context": [{"context": c, "count": int(n)} for c, n in by_context],
    }


@router.post("/{feedback_id}/read")
def mark_read(
    feedback_id: int,
    read: bool = Query(True),
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, str]:
    row = db.query(ResultFeedback).filter(ResultFeedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    row.read_at = datetime.now(timezone.utc) if read else None
    db.commit()
    return {"status": "ok"}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    _mod: User = Depends(require_moderator),
) -> dict[str, Any]:
    """Clear the badge: mark every unread negative-with-comment row as read."""
    n = (
        db.query(ResultFeedback)
        .filter(
            ResultFeedback.rating == "negative",
            ResultFeedback.read_at.is_(None),
            ResultFeedback.comment.isnot(None),
            func.trim(ResultFeedback.comment) != "",
        )
        .update({ResultFeedback.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
    )
    db.commit()
    return {"status": "ok", "marked": int(n or 0)}
