"""
API routes for the monologue "work" flow.

Meters the start of a rehearsal session and enforces the free-tier cap; the
frontend catches the 403 and shows the upgrade paywall.

It also records that the rehearsal happened. Until 2026-09-07 it did not, and
this is the flow most people are on: of the 242 users who searched in the last
30 days, 240 opened a monologue and 17 rehearsed a scene. "Activation" was
being read off `rehearsal_sessions` alone, which covers the two-person
ScenePartner and nothing else, so working a monologue was invisible.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.events import with_device
from app.core.database import SessionLocal, get_db
from app.middleware.rate_limiting import require_monologue_work
from app.models.actor import Monologue
from app.models.rehearsal import PartnerAudio
from app.models.user import User
from app.services import monologue_audio
from app.services.events import record_user_event
from app.services.rehearsal import partner_audio

router = APIRouter(prefix="/api/monologue-work", tags=["monologue-work"])


class StartSessionRequest(BaseModel):
    monologue_id: int


@router.post("/start")
def start_session(
    request: StartSessionRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(require_monologue_work(increment=True)),
):
    """
    Meter the start of a monologue-work session and enforce the free-tier cap.
    The gate raises 403 (with limit/used detail) when the cap is hit; the
    frontend catches that and shows the upgrade paywall.

    The event is written after the gate, so a paywalled attempt is not counted
    as a rehearsal — it would inflate the one number this exists to measure.
    """
    try:
        record_user_event(
            int(current_user.id),
            "monologue_work_started",
            with_device(
                {"monologue_id": request.monologue_id},
                http_request.headers.get("user-agent"),
            ),
        )
    except Exception:
        # record_user_event swallows its own errors; this is belt and braces so
        # instrumentation can never be what fails an actor's rehearsal.
        pass
    return {"ok": True}


class AudioRequest(BaseModel):
    monologue_id: int
    lines: list[str] = Field(min_length=1, max_length=monologue_audio.MAX_LINES)


def _synthesise(keys: list[str], text_for: dict[str, tuple[str, str | None]]) -> None:
    """BackgroundTask with its own session: the request is long gone."""
    db = SessionLocal()
    try:
        partner_audio.synthesise_pending(db, keys, text_for)
    finally:
        db.close()


@router.post("/audio")
def audio_for_lines(
    req: AudioRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The read-aloud for "Hear it": one {key, url} per line, in order.

    `url` is null while a line is still being made; the browser polls
    GET /api/rehearsal/audio/{key} for it, the same route partner lines use.
    Not metered here: the run was metered by /start, which the browser calls
    before it asks for any audio.
    """
    monologue = db.get(Monologue, req.monologue_id)
    if monologue is None:
        raise HTTPException(status_code=404, detail="No such monologue")
    source = monologue_audio.source_text(monologue.text, monologue.text_segments)
    if not monologue_audio.lines_belong(req.lines, source):
        raise HTTPException(status_code=422, detail="Those lines are not from this piece")

    voice = monologue_audio.voice_for(monologue.character_gender)
    keys: list[str] = []
    text_for: dict[str, tuple[str, str | None]] = {}
    for line in req.lines:
        text = monologue_audio.clean_line(line)
        key = partner_audio.ensure(db, voice.vendor, voice.id, None, text)
        keys.append(key)
        text_for[key] = (text, None)
    db.commit()

    rows = {k: db.get(PartnerAudio, k) for k in set(keys)}
    ready_paths = [r.storage_path for r in rows.values() if r.status == "ready" and r.storage_path]
    urls = partner_audio.signed_urls(ready_paths)

    now = datetime.now(timezone.utc)
    missing = [k for k in dict.fromkeys(keys) if rows[k].status == "pending" or partner_audio.retryable(rows[k], now)]
    if missing:
        background.add_task(_synthesise, missing, {k: text_for[k] for k in missing})

    return {
        "voice": voice.id,
        "lines": [
            {
                "key": k,
                "url": urls.get(rows[k].storage_path) if rows[k].status == "ready" and rows[k].storage_path else None,
                "failed": rows[k].status == "failed" and k not in missing,
            }
            for k in keys
        ],
    }
