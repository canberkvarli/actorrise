"""Ghost Light's push: tonight's speech at seven on the actor's own clock.

Until now every knock was scheduled on the phone, so an actor who had not
opened the app in a while was never reached. This sends one push a night,
"Tonight's speech", at seven local time, to an actor with a phone that said
yes, and only when they have not already been in the work tonight: a speech
read, a check-in, tonight's speech answered. Missing a night is never named.

Audition reminders stay on the phone (and in email); they are scheduled the
moment an audition is saved, so a push for them would only knock twice.

Sent through Expo's push service; a phone Expo says is gone is switched off.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, List, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.actor import Monologue, Play
from app.models.book import TonightPick
from app.models.practice import PracticeEntry
from app.models.push import PushSend, PushToken
from app.models.search_log import MonologueView

logger = logging.getLogger(__name__)

EXPO_URL = "https://exp.host/--/api/v2/push/send"
#: The hour the knock comes, on the actor's clock.
TONIGHT_HOUR = 19
KIND_TONIGHT = "tonight"


def _zone(tz: Optional[str]):
    try:
        return ZoneInfo(tz) if tz else timezone.utc
    except Exception:
        return timezone.utc


def send_expo(messages: List[dict]) -> List[dict]:
    """Send in hundreds, Expo's limit. Returns the tickets, one per message."""
    tickets: List[dict] = []
    for i in range(0, len(messages), 100):
        chunk = messages[i:i + 100]
        try:
            r = httpx.post(EXPO_URL, json=chunk, timeout=20, headers={"Accept": "application/json"})
            data = r.json().get("data", [])
        except Exception as e:  # noqa: BLE001
            logger.error("push: expo send failed: %s", e)
            data = [{"status": "error", "message": str(e)} for _ in chunk]
        tickets.extend(data if isinstance(data, list) else [data])
    return tickets


def _been_in_tonight(db: Session, user_id: int, start_utc: datetime, day) -> bool:
    """Already in the work tonight: no knock needed."""
    if db.query(PracticeEntry.id).filter(PracticeEntry.user_id == user_id, PracticeEntry.day == day).first():
        return True
    if db.query(TonightPick.id).filter(TonightPick.user_id == user_id, TonightPick.day == day, TonightPick.answer.isnot(None)).first():
        return True
    return db.query(MonologueView.id).filter(
        MonologueView.user_id == user_id, MonologueView.created_at >= start_utc
    ).first() is not None


def due_tonight(db: Session, now: Optional[datetime] = None) -> Iterable[tuple]:
    """(user_id, tokens, zone, local date) for every actor whose seven o'clock is now."""
    now = now or datetime.now(timezone.utc)
    rows = db.query(PushToken).filter(PushToken.disabled_at.is_(None)).all()
    by_user: dict = {}
    for t in rows:
        by_user.setdefault(int(t.user_id), []).append(t)
    for user_id, tokens in by_user.items():
        newest = max(tokens, key=lambda t: t.updated_at or t.created_at or now)
        zone = _zone(newest.tz)
        local = now.astimezone(zone)
        if local.hour != TONIGHT_HOUR:
            continue
        yield user_id, tokens, zone, local.date()


def run_tonight(db: Session, now: Optional[datetime] = None, send: bool = True) -> dict:
    """One pass: knock everyone whose seven o'clock it is, once a night."""
    from app.services.tonight import pick_for

    now = now or datetime.now(timezone.utc)
    stats = {"due": 0, "skipped": 0, "sent": 0, "failed": 0}
    for user_id, tokens, zone, day in due_tonight(db, now):
        stats["due"] += 1
        if db.query(PushSend.id).filter(PushSend.user_id == user_id, PushSend.kind == KIND_TONIGHT, PushSend.day == day).first():
            continue
        start = datetime(day.year, day.month, day.day, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
        if _been_in_tonight(db, user_id, start, day):
            stats["skipped"] += 1
            continue
        last = db.query(TonightPick.house).filter(TonightPick.user_id == user_id).order_by(TonightPick.day.desc()).first()
        house = last[0] if last else "stage"
        pick = pick_for(db, user_id, house, day)
        if pick is None:
            continue
        found = (
            db.query(Monologue.id, Monologue.character_name, Play.title)
            .join(Play, Play.id == Monologue.play_id)
            .filter(Monologue.id == pick.monologue_id)
            .first()
        )
        if found is None:
            continue
        mid, character, play = found
        # Written before sending: a crash after the send must not mean a second knock.
        db.add(PushSend(user_id=user_id, kind=KIND_TONIGHT, day=day))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        if not send:
            continue
        messages = [{
            "to": t.token,
            "title": "Tonight's speech",
            "body": f"{str(character).title()}, from {play}.",
            "sound": "default",
            "data": {"url": f"ghostlight://read/{mid}", "kind": KIND_TONIGHT},
        } for t in tokens]
        tickets = send_expo(messages)
        for t, ticket in zip(tokens, tickets):
            if ticket.get("status") == "ok":
                stats["sent"] += 1
                continue
            stats["failed"] += 1
            if (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                t.disabled_at = datetime.now(timezone.utc)  # type: ignore[assignment]
        db.commit()
    return stats
