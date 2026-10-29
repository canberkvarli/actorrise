"""The check-in: what an actor worked on tonight, and the nights before.

One read for the last stretch of nights (the lamp, the week, the log on
Account), one write per thing worked on, and a delete for a mistake. The day
is the phone's own (X-Timezone), the same as the read wall's.
"""

from __future__ import annotations

from datetime import timedelta
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.rate_limiting import normalise_tz
from app.models.practice import PracticeEntry, PracticeTiming
from app.models.user import User
from app.services.tonight import local_today

router = APIRouter(prefix="/api/practice", tags=["practice"])

Kind = Literal["speech", "scene", "class", "audition", "rehearsal"]


class EntryOut(BaseModel):
    id: int
    day: str
    kind: Kind
    note: Optional[str] = None
    seconds: Optional[int] = None


class EntryIn(BaseModel):
    kind: Kind
    note: Optional[str] = Field(default=None, max_length=280)
    #: From the timer; absent for work done away from the app. Twelve hours at most.
    seconds: Optional[int] = Field(default=None, ge=1, le=43200)


def _out(e: PracticeEntry, seconds: Optional[int] = None) -> EntryOut:
    return EntryOut(id=int(e.id), day=e.day.isoformat(), kind=e.kind, note=e.note, seconds=seconds)  # type: ignore[arg-type]


@router.get("", response_model=List[EntryOut])
async def list_entries(
    request: Request,
    days: int = Query(62, ge=1, le=400),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The last `days` nights, newest first."""
    today = local_today(normalise_tz(request.headers.get("x-timezone")))
    rows = (
        db.query(PracticeEntry)
        .filter(PracticeEntry.user_id == current_user.id, PracticeEntry.day > today - timedelta(days=days))
        .order_by(PracticeEntry.day.desc(), PracticeEntry.id.desc())
        .all()
    )
    ids = [e.id for e in rows]
    timed = dict(db.query(PracticeTiming.entry_id, PracticeTiming.seconds).filter(PracticeTiming.entry_id.in_(ids)).all()) if ids else {}
    return [_out(e, timed.get(e.id)) for e in rows]


@router.post("", response_model=EntryOut, status_code=201)
async def add_entry(
    body: EntryIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tonight: one thing worked on, on the phone's own date."""
    note = (body.note or "").strip() or None
    row = PracticeEntry(
        user_id=current_user.id,
        day=local_today(normalise_tz(request.headers.get("x-timezone"))),
        kind=body.kind,
        note=note,
    )
    db.add(row)
    db.flush()
    if body.seconds:
        db.add(PracticeTiming(entry_id=row.id, seconds=body.seconds))
    db.commit()
    return _out(row, body.seconds)


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.query(PracticeEntry).filter(PracticeEntry.id == entry_id, PracticeEntry.user_id == current_user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    db.query(PracticeTiming).filter(PracticeTiming.entry_id == row.id).delete()
    db.delete(row)
    db.commit()
