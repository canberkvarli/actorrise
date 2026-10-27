"""Cue, Canberk's assistant, for signed-in actors. See app/services/cue/."""

import json
from typing import Any

from app.api.auth import get_current_user
from app.core.database import SessionLocal, get_db
from app.models.user import User
from app.services.cue import agent, caps, tools
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/cue", tags=["cue"])


class CueMessageIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.get("/thread")
def get_thread(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Today's conversation and where the actor stands against the cap."""
    plus = tools.is_plus(db, current_user)
    cap = caps.check(db, int(current_user.id), plus)
    conv = agent.today_conversation(db, int(current_user.id), create=False)
    return {
        "messages": [{"role": m.role, "content": m.content} for m in (conv.messages if conv else [])],
        "is_plus": plus,
        "used": cap.used,
        "limit": cap.limit,
        "capped": cap.reason == "free_cap",
    }


@router.post("/messages")
def post_message(
    body: CueMessageIn,
    current_user: User = Depends(get_current_user),
    request_db: Session = Depends(get_db),
) -> StreamingResponse:
    user_id = int(current_user.id)
    # get_current_user's session would otherwise sit on a pooled connection
    # until the whole reply has streamed, while the stream opens a second.
    request_db.close()

    def stream():
        # A comment frame first, so the headers and first bytes leave at once
        # and the sheet knows the line is open.
        yield ": open\n\n"
        db = SessionLocal()
        try:
            user = db.query(User).get(user_id)
            for event in agent.respond(db, user, body.text):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception:  # noqa: BLE001
            db.rollback()
            yield f"data: {json.dumps({'type': 'text', 'text': agent.FALLBACK})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'reply': agent.FALLBACK, 'handed_off': False})}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
