"""/admin/cue: every Cue conversation, handoffs on top, and what Cue costs."""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.cue import CueConversation, CueMessage
from app.models.user import User
from app.services.cue import caps
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/admin/cue", tags=["admin", "cue"])


def _row(c: CueConversation, email: str | None, first: str | None, count: int) -> dict[str, Any]:
    return {
        "id": c.id,
        "user_id": c.user_id,
        "email": email,
        "started_at": c.started_at,
        "last_at": c.last_at,
        "handoff_at": c.handoff_at,
        "handoff_reason": c.handoff_reason,
        "read": c.read_at is not None,
        "first_question": (first or "")[:200],
        "messages": count,
    }


@router.get("")
def list_conversations(
    days: int = Query(30, ge=1, le=90),
    _: User = Depends(require_moderator),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    convs = (
        db.query(CueConversation, User.email)
        .join(User, User.id == CueConversation.user_id)
        .filter(CueConversation.last_at >= since)
        .order_by(
            # Unread handoffs first, then other handoffs, then the rest; newest first in each.
            (CueConversation.handoff_at.isnot(None) & CueConversation.read_at.is_(None)).desc(),
            CueConversation.handoff_at.isnot(None).desc(),
            CueConversation.last_at.desc(),
        )
        .limit(200)
        .all()
    )
    ids = [c.id for c, _ in convs]
    counts = dict(
        db.query(CueMessage.conversation_id, func.count(CueMessage.id))
        .filter(CueMessage.conversation_id.in_(ids or [0]))
        .group_by(CueMessage.conversation_id)
        .all()
    )
    first_q: dict[int, str] = {}
    if ids:
        sub = (
            db.query(CueMessage.conversation_id, func.min(CueMessage.id).label("mid"))
            .filter(CueMessage.conversation_id.in_(ids), CueMessage.role == "user")
            .group_by(CueMessage.conversation_id)
            .subquery()
        )
        for cid, content in db.query(CueMessage.conversation_id, CueMessage.content).join(sub, CueMessage.id == sub.c.mid):
            first_q[cid] = content
    return {"conversations": [_row(c, email, first_q.get(c.id), counts.get(c.id, 0)) for c, email in convs]}


@router.get("/summary")
def summary(_: User = Depends(require_moderator), db: Session = Depends(get_db)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    unread = (
        db.query(func.count(CueConversation.id))
        .filter(CueConversation.handoff_at.isnot(None), CueConversation.read_at.is_(None))
        .scalar()
        or 0
    )
    tin, tout = (
        db.query(func.coalesce(func.sum(CueMessage.input_tokens), 0), func.coalesce(func.sum(CueMessage.output_tokens), 0))
        .filter(CueMessage.created_at >= now - timedelta(days=30))
        .one()
    )
    asked_today = (
        db.query(func.count(CueMessage.id))
        .filter(CueMessage.role == "user", CueMessage.created_at >= caps.day_start(now))
        .scalar()
        or 0
    )
    return {
        "unread_handoffs": int(unread),
        "messages_today": int(asked_today),
        "spend_today_usd": round(caps.spend_today(db, now), 4),
        "spend_30d_usd": round(caps.cost_usd(int(tin), int(tout)), 4),
        "daily_ceiling_usd": caps.daily_usd(),
    }


@router.get("/{conversation_id}")
def get_conversation(conversation_id: int, _: User = Depends(require_moderator), db: Session = Depends(get_db)) -> dict[str, Any]:
    c = db.query(CueConversation).get(conversation_id)
    if not c:
        raise HTTPException(404, "Not found")
    email = db.query(User.email).filter(User.id == c.user_id).scalar()
    return {
        **_row(c, email, None, len(c.messages)),
        "thread": [
            {"role": m.role, "content": m.content, "tools": m.tools or [], "at": m.created_at}
            for m in c.messages
        ],
    }


@router.post("/{conversation_id}/read")
def mark_read(conversation_id: int, _: User = Depends(require_moderator), db: Session = Depends(get_db)) -> dict[str, bool]:
    c = db.query(CueConversation).get(conversation_id)
    if not c:
        raise HTTPException(404, "Not found")
    if c.read_at is None:
        c.read_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()
    return {"ok": True}
