"""Turn a pasted casting notice (and/or the first pages of a sides PDF) into a
draft audition the actor confirms. Nothing here saves anything.

gpt-4o-mini in JSON mode through get_llm(), temperature 0. Every field comes
back as {value, confidence}; the card outlines the low ones. A model failure is
never a dead end: the caller gets an empty draft with the pasted text in notes.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.audition import KINDS

logger = logging.getLogger(__name__)

MAX_TEXT = 12_000
TIMEOUT_S = 10
FREE_PARSES_PER_MONTH = 5
FIELDS = ("project", "role", "kind", "starts_at", "due_at", "location", "casting", "material_raw", "bring", "notes")
MAX_LEN = {"project": 200, "role": 200, "location": 300, "casting": 200, "material_raw": 300, "bring": 300, "notes": 4000}

PROMPT = """You read casting notices and audition emails for actors.
Today is {today}. The actor's timezone is {tz}.
Return JSON with exactly these keys. Each of them except "material" is an object {{"value": ..., "confidence": "high" or "low"}}:
project, role, kind ("in_person", "self_tape" or "virtual"), starts_at (appointment, ISO 8601 local time without offset, e.g. 2026-10-09T10:40:00), due_at (self-tape deadline, same format), location, casting (casting director or office), material_raw (what to prepare, as written, e.g. "1 min contemporary comedic"), bring (what to bring).
"material" is an object {{"length_seconds": int or null, "genre": "comedic", "dramatic" or null, "era": "contemporary", "classical" or null, "count": int or null}}.
Use a null value when the notice does not say. Use "low" confidence for anything you inferred or are unsure about, including relative dates like "Thursday".

Notice:
<<<
{text}
>>>"""


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _field(raw: Any) -> tuple[Any, str]:
    if not isinstance(raw, dict):
        return None, "low"
    conf = raw.get("confidence") if raw.get("confidence") in ("high", "low") else "low"
    return raw.get("value"), conf


def _date(value: Any, conf: str, now: datetime, zone: ZoneInfo) -> dict:
    if not isinstance(value, str) or not value.strip():
        return {"value": None, "confidence": conf if value is None else "low"}
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        return {"value": None, "confidence": "low"}
    dt = dt.replace(tzinfo=zone) if dt.tzinfo is None else dt
    dt = dt.astimezone(timezone.utc)
    if dt < now - timedelta(days=1) or dt > now + timedelta(days=548):
        conf = "low"
    return {"value": dt.isoformat(), "confidence": conf}


def empty_draft(notes: str = "") -> dict:
    d = {f: {"value": None, "confidence": "low"} for f in FIELDS}
    d["kind"] = {"value": "in_person", "confidence": "low"}
    d["notes"] = {"value": notes[:MAX_LEN["notes"]] or None, "confidence": "high"}
    d["material"] = None
    return d


def normalize_draft(raw: dict, now: datetime, tz: str) -> dict:
    zone = _zone(tz)
    d = empty_draft()
    d["notes"] = {"value": None, "confidence": "high"}
    for f in ("project", "role", "location", "casting", "material_raw", "bring"):
        value, conf = _field(raw.get(f))
        if isinstance(value, str) and value.strip():
            d[f] = {"value": value.strip()[: MAX_LEN[f]], "confidence": conf}
        else:
            d[f] = {"value": None, "confidence": "low" if not isinstance(raw.get(f), dict) else conf}
    kind, conf = _field(raw.get("kind"))
    d["kind"] = {"value": kind, "confidence": conf} if kind in KINDS else {"value": "in_person", "confidence": "low"}
    for f in ("starts_at", "due_at"):
        value, conf = _field(raw.get(f))
        d[f] = _date(value, conf, now, zone)
    m = raw.get("material")
    if isinstance(m, dict):
        d["material"] = {
            "length_seconds": m.get("length_seconds") if isinstance(m.get("length_seconds"), int) else None,
            "genre": m.get("genre") if m.get("genre") in ("comedic", "dramatic") else None,
            "era": m.get("era") if m.get("era") in ("contemporary", "classical") else None,
            "count": m.get("count") if isinstance(m.get("count"), int) else None,
        }
    return d


def _default_llm_call(prompt: str) -> str:
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model="gpt-4o-mini", temperature=0, use_json_format=True)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: llm.invoke(prompt).content).result(timeout=TIMEOUT_S)


def parse_notice(
    text: str, now: datetime, tz: str, llm_call: Optional[Callable[[str], str]] = None
) -> dict:
    """{ok, draft}. ok is False when the model failed twice or timed out."""
    call = llm_call or _default_llm_call
    local = now.astimezone(_zone(tz))
    prompt = PROMPT.format(today=local.strftime("%A %Y-%m-%d %H:%M"), tz=tz, text=text[:MAX_TEXT])
    for attempt in range(2):
        try:
            raw = json.loads(call(prompt))
            if isinstance(raw, dict):
                return {"ok": True, "draft": normalize_draft(raw, now, tz)}
        except (json.JSONDecodeError, TypeError):
            continue
        except (FutureTimeout, Exception) as exc:  # noqa: BLE001
            logger.warning("audition parse failed: %s", exc)
            break
    return {"ok": False, "draft": empty_draft(text)}


def header_text_from_pdf(content: bytes) -> str:
    """The first two pages: enough for the title, role and casting header."""
    from app.services.script_parser import extract_pdf_text

    try:
        return extract_pdf_text(content, only_pages={1, 2}) or ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("audition parse: pdf text failed: %s", exc)
        return ""


def _is_paid(db: Session, user_id: int) -> bool:
    from app.models.billing import UserSubscription

    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    return bool(sub and sub.is_active and sub.tier and sub.tier.name != "free")


def quota(db: Session, user_id: int, now: datetime) -> dict:
    """Free: 5 parses per calendar month (UTC), counted off the events table."""
    from app.models.user_event import UserEvent

    if _is_paid(db, user_id):
        return {"used": None, "limit": None, "remaining": None}
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = (
        db.query(UserEvent)
        .filter(
            UserEvent.user_id == user_id,
            UserEvent.event_name == "audition_parse_requested",
            UserEvent.created_at >= start,
        )
        .count()
    )
    return {"used": used, "limit": FREE_PARSES_PER_MONTH, "remaining": max(0, FREE_PARSES_PER_MONTH - used)}
