"""Turn a pasted casting notice (and/or the first pages of a sides PDF) into a
draft audition the actor confirms. Nothing here saves anything.

gpt-4o-mini in JSON mode through get_llm(), temperature 0. Every field comes
back as {value, confidence}; the card outlines the low ones. A model failure is
never a dead end: the caller gets an empty draft with the pasted text in notes.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, time, timedelta, timezone
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models.audition import KINDS

logger = logging.getLogger(__name__)

MAX_TEXT = 12_000
TIMEOUT_S = 10
# Founder call: no unlimited reads. Manual entry stays free for everyone.
PARSES_PER_MONTH = {"free": 5, "plus": 30, "pro": 100}
FIELDS = (
    "project", "role", "kind", "starts_at", "due_at", "location", "casting", "material_raw", "bring", "notes",
    "through", "through_kind", "shoots",
)
TEXT_FIELDS = ("project", "role", "location", "casting", "material_raw", "bring", "through", "shoots")
MAX_LEN = {
    "project": 200, "role": 200, "location": 300, "casting": 200, "material_raw": 300, "bring": 300, "notes": 4000,
    "through": 200, "shoots": 300,
}
THROUGH_KINDS = ("agent", "manager", "self")

PROMPT = """You read casting notices and audition emails for actors.
Today is {today}. The actor's timezone is {tz}.
Return JSON with exactly these keys. Each of them except "material" is an object {{"value": ..., "confidence": "high" or "low"}}:
project, role, kind ("in_person", "self_tape" or "virtual"), starts_at (appointment, ISO 8601 local time without offset, e.g. 2026-10-09T10:40:00), due_at (self-tape deadline, same format), location, casting (casting director or office), material_raw (what to prepare, as written, e.g. "1 min contemporary comedic"), bring (what to bring), through (the agent or manager who sent this to the actor, by name and agency, e.g. "Maya Chen, Bright Talent"; null if the actor submitted themselves or it does not say), through_kind ("agent", "manager" or "self"), shoots (shoot dates, union status and rate, as written, e.g. "Shoots Jan to Mar, SAG, scale").
"material" is an object {{"length_seconds": int or null, "genre": "comedic", "dramatic" or null, "era": "contemporary", "classical" or null, "count": int or null, "own_choice": true, false or null}}. own_choice is true when the actor chooses their own piece (a monologue or song of their choice), false when casting sends what to prepare (sides, scenes, pages, a script), null if the notice does not say.
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


def _date(value: Any, conf: str, now: datetime, zone: ZoneInfo, end_of_day: bool = False) -> dict:
    if not isinstance(value, str) or not value.strip():
        return {"value": None, "confidence": conf if value is None else "low"}
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        return {"value": None, "confidence": "low"}
    if end_of_day and len(value.strip()) <= 10:
        dt = datetime.combine(dt.date(), time(23, 59))  # a deadline with no time means end of that day
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
    for f in TEXT_FIELDS:
        value, conf = _field(raw.get(f))
        if isinstance(value, str) and value.strip():
            d[f] = {"value": value.strip()[: MAX_LEN[f]], "confidence": conf}
        else:
            d[f] = {"value": None, "confidence": "low" if not isinstance(raw.get(f), dict) else conf}
    tk, conf = _field(raw.get("through_kind"))
    d["through_kind"] = {"value": tk, "confidence": conf} if tk in THROUGH_KINDS else {"value": None, "confidence": "low"}
    kind, conf = _field(raw.get("kind"))
    d["kind"] = {"value": kind, "confidence": conf} if kind in KINDS else {"value": "in_person", "confidence": "low"}
    for f in ("starts_at", "due_at"):
        value, conf = _field(raw.get(f))
        d[f] = _date(value, conf, now, zone, end_of_day=(f == "due_at"))
    m = raw.get("material")
    if isinstance(m, dict):
        def _int(v):
            return v if isinstance(v, int) and not isinstance(v, bool) else None

        def _word(v, allowed):
            v = v.strip().lower() if isinstance(v, str) else None
            return v if v in allowed else None

        d["material"] = {
            "length_seconds": _int(m.get("length_seconds")),
            "genre": _word(m.get("genre"), ("comedic", "dramatic")),
            "era": _word(m.get("era"), ("contemporary", "classical")),
            "count": _int(m.get("count")),
            "own_choice": m.get("own_choice") if isinstance(m.get("own_choice"), bool) else None,
        }
    return d


def _default_llm_call(prompt: str) -> str:
    from app.services.ai.langchain.config import get_llm

    # The timeout lives on the client itself: a thread pool cannot cancel a hung
    # call, and leaving its `with` block would wait for it.
    llm = get_llm(model="gpt-4o-mini", temperature=0, use_json_format=True, timeout=TIMEOUT_S, max_retries=0)
    return llm.invoke(prompt).content


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
        except Exception as exc:  # noqa: BLE001
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


def _tier(db: Session, user_id: int) -> str:
    """free, plus or pro. An inactive or expired sub is free; any other paid
    tier name (a legacy solo, a comp) reads like plus."""
    from app.models.billing import UserSubscription

    sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
    if not (sub and sub.is_active and sub.tier):
        return "free"
    name = (sub.tier.name or "").lower()
    # monologues is the Ghost Light iOS app tier: monologue-only, so it reads like free here.
    if name in ("free", "monologues"):
        return "free"
    return "pro" if name == "pro" else "plus"


def quota(db: Session, user_id: int, now: datetime) -> dict:
    """Reads per calendar month (UTC) by tier, counted off the events table."""
    from app.models.user_event import UserEvent

    tier = _tier(db, user_id)
    limit = PARSES_PER_MONTH[tier]
    start = now.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = (
        db.query(UserEvent)
        .filter(
            UserEvent.user_id == user_id,
            UserEvent.event_name == "audition_parse_requested",
            UserEvent.created_at >= start,
        )
        .count()
    )
    return {"used": used, "limit": limit, "remaining": max(0, limit - used), "tier": tier}
