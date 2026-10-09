"""/api/auditions: the audition tracker.

Plain REST and plain JSON so Ghost Light can use the same endpoints later.
Static paths are declared before /{audition_id}, which would otherwise swallow
"next" and "parse" and answer 422.
"""

import html
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.audition import Audition
from app.models.user import User
from app.services.auditions import assist, core, ics, parse
from app.services.events import record_user_event

router = APIRouter(prefix="/api/auditions", tags=["auditions"])

SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://api.actorrise.com")


def require_moderator(user: User = Depends(get_current_user)) -> User:
    """Moderators only while Canberk tries the tracker (same check as the admin
    routers). The public token routes (email outcome links, calendar.ics?k=)
    stay open; only a moderator can hold a token anyway."""
    if not user.is_moderator:
        raise HTTPException(status_code=403, detail="You do not have moderator permissions")
    return user


CALENDAR_PAST_DAYS = 30
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AuditionIn(BaseModel):
    project: str = Field(min_length=1, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    kind: str = "in_person"
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    tz: str = Field("UTC", max_length=64)
    location: Optional[str] = Field(None, max_length=300)
    casting: Optional[str] = Field(None, max_length=200)
    material_raw: Optional[str] = Field(None, max_length=300)
    material: Optional[dict[str, Any]] = None
    bring: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=4000)
    tape_link: Optional[str] = Field(None, max_length=500)
    user_script_id: Optional[int] = None
    reminders_on: bool = True
    through: Optional[str] = Field(None, max_length=200)
    through_kind: Optional[str] = None
    shoots: Optional[str] = Field(None, max_length=300)
    source: str = "manual"


class AuditionPatch(BaseModel):
    project: Optional[str] = Field(None, max_length=200)
    role: Optional[str] = Field(None, max_length=200)
    kind: Optional[str] = None
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    tz: Optional[str] = Field(None, max_length=64)
    location: Optional[str] = Field(None, max_length=300)
    casting: Optional[str] = Field(None, max_length=200)
    material_raw: Optional[str] = Field(None, max_length=300)
    material: Optional[dict[str, Any]] = None
    bring: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=4000)
    tape_link: Optional[str] = Field(None, max_length=500)
    user_script_id: Optional[int] = None
    reminders_on: Optional[bool] = None
    through: Optional[str] = Field(None, max_length=200)
    through_kind: Optional[str] = None
    shoots: Optional[str] = Field(None, max_length=300)
    bring_list: Optional[list[dict[str, Any]]] = None
    after_notes: Optional[dict[str, Any]] = None
    reminder_moments: Optional[list[str]] = None


class PieceIn(BaseModel):
    monologue_id: Optional[int] = None
    scene_id: Optional[int] = None


class OutcomeIn(BaseModel):
    outcome: str


class AskIn(BaseModel):
    q: str = Field(min_length=2, max_length=500)


def _owned(db: Session, user: User, audition_id: int) -> Audition:
    a = core.get_owned(db, int(user.id), audition_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Audition not found")
    return a


# ---------- static paths first ----------


@router.get("/next")
def get_next(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    now = _now()
    a = core.next_upcoming(db, int(user.id), now)
    return {"audition": core.serialize(db, a, now, with_prep=False) if a else None}


@router.get("/deleted")
def list_deleted(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    """Removed in the last 30 days, so a slip of the thumb can come back."""
    now = _now()
    return [
        {**core.serialize(db, a, now, with_prep=False), "deleted_at": a.deleted_at.isoformat()}
        for a in core.recently_deleted(db, int(user.id), now)
    ]


@router.get("/quota")
def get_quota(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    return parse.quota(db, int(user.id), _now())


@router.post("/parse")
async def parse_breakdown(
    text: Optional[str] = Form(None),
    tz: str = Form("UTC"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_moderator),
):
    # Every DB call and the PDF read run in a worker thread: on the event loop
    # they block the whole API (see the comment in app/api/scripts.py).
    now = _now()
    uid = int(user.id)
    q = await run_in_threadpool(parse.quota, db, uid, now)
    if q["remaining"] == 0:
        raise HTTPException(status_code=403, detail={"error": "audition_parse_quota", "quota": q})
    body = (text or "").strip()
    has_pdf = False
    if file is not None and file.filename:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Sides must be a PDF")
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        has_pdf = True
        header = await run_in_threadpool(parse.header_text_from_pdf, content)
        body = f"{body}\n\n[First pages of the sides]\n{header}".strip()
    if not body:
        raise HTTPException(status_code=400, detail="Paste the notice or drop the sides")
    await run_in_threadpool(
        record_user_event, uid, "audition_parse_requested", {"has_pdf": has_pdf, "has_text": bool((text or "").strip())}
    )
    result = await run_in_threadpool(parse.parse_notice, body, now, tz)
    if not result["ok"]:
        await run_in_threadpool(record_user_event, uid, "audition_parse_failed", {"reason": "model"})
    result["quota"] = await run_in_threadpool(parse.quota, db, uid, now)
    return result


@router.get("/calendar-link")
def get_calendar_link(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    if not user.calendar_feed_key:
        user.calendar_feed_key = secrets.token_urlsafe(24)
        db.commit()
    return {"url": f"{API_PUBLIC_URL}/api/auditions/calendar.ics?k={user.calendar_feed_key}"}


@router.post("/calendar-link/reset")
def reset_calendar_link(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    user.calendar_feed_key = secrets.token_urlsafe(24)
    db.commit()
    return {"url": f"{API_PUBLIC_URL}/api/auditions/calendar.ics?k={user.calendar_feed_key}"}


@router.get("/calendar.ics")
def calendar_feed(k: str = Query(..., min_length=10), db: Session = Depends(get_db)):
    owner = db.query(User).filter(User.calendar_feed_key == k).first()
    if owner is None:
        raise HTTPException(status_code=404, detail="Unknown calendar")
    now = _now()
    # Subscribed calendars delete events that vanish from the feed, so keep
    # recent past auditions (last 30 days) alongside upcoming and waiting ones.
    cutoff = now - timedelta(days=CALENDAR_PAST_DAYS)
    rows = []
    for a in core.list_auditions(db, int(owner.id), now):  # excludes deleted
        w = core.when(a)
        if core.scope_of(a, now) != "past" or (w is not None and w >= cutoff):
            rows.append(a)
    return Response(
        content=ics.build_calendar(rows, now=now, site=SITE_URL),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=900"},
    )


_OUTCOME_WORDS = {"good": "it went well", "callback": "callback", "no": "not this time"}
_OUTCOME_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Log your audition</title>
<style>body{{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#222}}
button{{font:inherit;padding:.7rem 1.4rem;border:0;border-radius:4px;background:#CB4B00;color:#fff;cursor:pointer}}</style>
</head><body>
<h1>{project}</h1>
<p>Log it as: {word}?</p>
<form method="post" action="{action}"><input type="hidden" name="o" value="{o}">
<button type="submit">Yes, log it</button></form>
</body></html>"""


def _outcome_audition(db: Session, token: str) -> Audition:
    a = db.query(Audition).filter(Audition.outcome_token == token, Audition.deleted_at.is_(None)).first()
    if a is None:
        raise HTTPException(status_code=404, detail="Unknown link")
    return a


@router.get("/outcome/{token}", response_class=HTMLResponse)
def outcome_confirm(token: str, o: str = Query(...), db: Session = Depends(get_db)):
    """The three links in the morning-after email land here. A GET records nothing
    (mail scanners open every link); the button below POSTs to the same URL."""
    a = _outcome_audition(db, token)
    if o not in core.OUTCOMES:
        return RedirectResponse(f"{SITE_URL}/auditions", status_code=303)
    page = _OUTCOME_PAGE.format(
        project=html.escape(a.project or "Your audition"),
        word=html.escape(_OUTCOME_WORDS.get(o, o)),
        action=f"/api/auditions/outcome/{html.escape(token, quote=True)}",
        o=html.escape(o, quote=True),
    )
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})


@router.post("/outcome/{token}")
def outcome_from_email(
    token: str,
    o: Optional[str] = Query(None),
    o_form: Optional[str] = Form(None, alias="o"),
    db: Session = Depends(get_db),
):
    a = _outcome_audition(db, token)
    choice = o or o_form
    if choice not in core.OUTCOMES:
        return RedirectResponse(f"{SITE_URL}/auditions", status_code=303)
    core.log_outcome(db, a, choice, via="email")
    return RedirectResponse(f"{SITE_URL}/auditions/{a.id}?logged={choice}&ar=after", status_code=303)


# ---------- collection ----------


@router.get("")
def list_auditions(
    scope: Optional[str] = Query(None, pattern="^(upcoming|waiting|past)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_moderator),
):
    now = _now()
    return [core.serialize(db, a, now) for a in core.list_auditions(db, int(user.id), now, scope)]


@router.post("", status_code=201)
def create(body: AuditionIn, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    data = body.model_dump(exclude={"source"})
    try:
        a = core.create_audition(db, int(user.id), data, source=body.source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


# ---------- one audition ----------


@router.get("/{audition_id}")
def get_one(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    return core.serialize(db, _owned(db, user, audition_id), _now())


@router.patch("/{audition_id}")
def patch(audition_id: int, body: AuditionPatch, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    a = _owned(db, user, audition_id)
    try:
        core.update_audition(db, a, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.delete("/{audition_id}", status_code=204)
def delete(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    core.delete_audition(db, _owned(db, user, audition_id))
    return Response(status_code=204)


@router.get("/{audition_id}/sides")
def get_sides(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    """The whole of the attached sides as text, so they read on the audition's own page."""
    a = _owned(db, user, audition_id)
    title, status, text = core.sides_text(db, a)
    if title is None and status is None:
        raise HTTPException(status_code=404, detail="No sides on this audition")
    return {"title": title, "status": status, "text": (text or "").strip()[: core.SIDES_FULL_CHARS] or None}


@router.post("/{audition_id}/restore")
def restore(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    now = _now()
    a = core.restore_audition(db, int(user.id), audition_id, now)
    if a is None:
        raise HTTPException(status_code=404, detail="Audition not found")
    return core.serialize(db, a, now)


@router.post("/{audition_id}/outcome")
def outcome_in_app(audition_id: int, body: OutcomeIn, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    a = _owned(db, user, audition_id)
    try:
        core.log_outcome(db, a, body.outcome, via="app")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.post("/{audition_id}/pieces", status_code=201)
def add_piece(audition_id: int, body: PieceIn, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    a = _owned(db, user, audition_id)
    try:
        core.add_piece(db, a, monologue_id=body.monologue_id, scene_id=body.scene_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return core.serialize(db, a, _now())


@router.delete("/{audition_id}/pieces/{piece_id}", status_code=204)
def remove_piece(audition_id: int, piece_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    if not core.remove_piece(db, _owned(db, user, audition_id), piece_id):
        raise HTTPException(status_code=404, detail="Piece not found")
    return Response(status_code=204)


# ---------- the AI help (sync on purpose: FastAPI runs these in a worker thread) ----------


@router.post("/{audition_id}/assist/read")
def assist_read(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    a = _owned(db, user, audition_id)
    before = (a.assist or {}).get("read") if isinstance(a.assist, dict) else None
    read = assist.read_scene(db, a)
    if read is not None and read is not before:  # made now, not served from the saved one
        record_user_event(int(user.id), "audition_assist_made", {"audition_id": a.id, "part": "read"})
    return core.serialize(db, a, _now())


@router.post("/{audition_id}/callback", status_code=201)
def add_callback(audition_id: int, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    """A callback is its own appointment: a new audition carrying this one's details, no date yet."""
    a = _owned(db, user, audition_id)
    return core.serialize(db, core.add_callback(db, a), _now())


@router.post("/{audition_id}/ask")
def ask(audition_id: int, body: AskIn, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    a = _owned(db, user, audition_id)
    now = _now()
    q = assist.asks_quota(db, int(user.id), now)
    if q["remaining"] == 0:
        raise HTTPException(status_code=403, detail={"error": "audition_ask_quota", "quota": q})
    entry = assist.ask(db, a, body.q, now)
    if entry is None:
        raise HTTPException(status_code=502, detail="I couldn't answer that just now. Try again in a moment.")
    record_user_event(int(user.id), "audition_asked", {"audition_id": a.id})
    return core.serialize(db, a, now)


@router.delete("/{audition_id}/ask")
def forget_ask(
    audition_id: int,
    at: str = Query(..., max_length=64),
    db: Session = Depends(get_db),
    user: User = Depends(require_moderator),
):
    a = _owned(db, user, audition_id)
    if not assist.forget_ask(db, a, at):
        raise HTTPException(status_code=404, detail="Question not found")
    return core.serialize(db, a, _now())
