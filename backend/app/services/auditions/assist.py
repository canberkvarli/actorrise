"""The AI help on an audition's page: getting there, a read on the scene (with
what to wear folded in), and "ask me" about this one audition.

Each helper is saved on auditions.assist with the inputs it was made from (key),
so a page view never pays twice; it runs again only when those inputs change.
A failure is never an error to the actor: the helper returns None and the page
simply goes without that section.

Getting there never trusts the model for facts. Google Routes plans the trip;
the model only writes the plan up as one pencilled line, and a line that loses
the leave time is thrown away for a plain one built from the route itself.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.audition import Audition
from app.services.auditions import core

logger = logging.getLogger(__name__)

ARRIVE_EARLY_MIN = 15
TIMEOUT_S = 12
ASKS_PER_MONTH = {"free": 10, "plus": 50, "pro": 200}
ASKS_KEPT = 20
SIDES_CHARS_FOR_MODEL = 6000
SKETCH_POINTS = 48
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
ROUTES_FIELDS = ",".join((
    "routes.duration",
    "routes.polyline.encodedPolyline",
    "routes.legs.steps.travelMode",
    "routes.legs.steps.staticDuration",
    "routes.legs.steps.transitDetails",
))

LlmCall = Callable[[str], str]
RoutesCall = Callable[[str, str, str, datetime], Optional[dict]]


# ---------- shared bits ----------


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _clock(dt: datetime, tz: str) -> str:
    """2:40, or 2 pm on the hour: how an actor says it."""
    local = dt.astimezone(_zone(tz))
    h = local.hour % 12 or 12
    return f"{h}:{local.minute:02d}"


def _key(*parts: Any) -> str:
    return hashlib.sha1(json.dumps(parts, default=str).encode()).hexdigest()[:16]


def _no_dashes(text: str) -> str:
    """House voice: no em or en dashes, ever. Swap them for commas."""
    return re.sub(r"\s*[–—]\s*", ", ", text).strip()


def _default_llm_call(prompt: str) -> str:
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model="gpt-4o-mini", temperature=0.3, use_json_format=True, timeout=TIMEOUT_S, max_retries=0)
    return llm.invoke(prompt).content


def _ask_json(call: LlmCall, prompt: str) -> Optional[dict]:
    try:
        raw = json.loads(call(prompt))
    except Exception as exc:  # noqa: BLE001
        logger.warning("audition assist: model failed: %s", exc)
        return None
    return raw if isinstance(raw, dict) else None


def _save(db: Session, a: Audition, part: str, value: Any) -> None:
    data = dict(a.assist) if isinstance(a.assist, dict) else {}
    data[part] = value
    a.assist = data
    flag_modified(a, "assist")
    db.commit()


# ---------- getting there ----------


def decode_polyline(encoded: str) -> list[tuple[float, float]]:
    """Google's encoded polyline as (lat, lng) pairs."""
    points: list[tuple[float, float]] = []
    index = lat = lng = 0
    while index < len(encoded):
        for which in (0, 1):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if which == 0:
                lat += delta
            else:
                lng += delta
        points.append((lat / 1e5, lng / 1e5))
    return points


def sketch_points(points: list[tuple[float, float]], n: int = SKETCH_POINTS) -> list[list[float]]:
    """The route squeezed into a 0..1 box, north up, at most n points, for the hand-drawn sketch."""
    if len(points) < 2:
        return []
    step = max(1, len(points) // n)
    picked = points[::step]
    if picked[-1] != points[-1]:
        picked.append(points[-1])
    lats = [p[0] for p in picked]
    lngs = [p[1] for p in picked]
    span = max(max(lats) - min(lats), max(lngs) - min(lngs)) or 1e-9
    return [[round((lng - min(lngs)) / span, 4), round((max(lats) - lat) / span, 4)] for lat, lng in picked]


def _seconds(value: Any) -> int:
    m = re.match(r"^(\d+)s$", str(value or ""))
    return int(m.group(1)) if m else 0


def summarize_route(route: dict) -> dict:
    """What a person needs from a Routes API route: the rides, and how much walking."""
    rides: list[dict] = []
    walk_s = 0
    for leg in route.get("legs") or []:
        for step in leg.get("steps") or []:
            if step.get("travelMode") == "TRANSIT" and step.get("transitDetails"):
                td = step["transitDetails"]
                line = td.get("transitLine") or {}
                stops = td.get("stopDetails") or {}
                rides.append({
                    "line": line.get("nameShort") or line.get("name"),
                    "vehicle": ((line.get("vehicle") or {}).get("type") or "").lower() or None,
                    "from": (stops.get("departureStop") or {}).get("name"),
                    "to": (stops.get("arrivalStop") or {}).get("name"),
                    "stops": td.get("stopCount"),
                })
            elif step.get("travelMode") == "WALK":
                walk_s += _seconds(step.get("staticDuration"))
    return {
        "minutes": max(1, round(_seconds(route.get("duration")) / 60)),
        "rides": rides,
        "walk_minutes": round(walk_s / 60),
        "polyline": (route.get("polyline") or {}).get("encodedPolyline") or "",
    }


def _default_routes_call(origin: str, destination: str, mode: str, arrive: datetime) -> Optional[dict]:
    key = os.getenv("GOOGLE_MAPS_KEY")
    if not key:
        return None
    import httpx

    body: dict[str, Any] = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": "TRANSIT" if mode == "transit" else "DRIVE",
    }
    if mode == "transit":
        body["arrivalTime"] = arrive.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    try:
        r = httpx.post(
            ROUTES_URL,
            json=body,
            headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": ROUTES_FIELDS},
            timeout=TIMEOUT_S,
        )
        r.raise_for_status()
        routes = r.json().get("routes") or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("audition assist: routes failed: %s", exc)
        return None
    return summarize_route(routes[0]) if routes else None


def plain_trip_line(facts: dict) -> str:
    """The line with no model in it, built only from the route."""
    first = (facts["rides"] or [None])[0]
    if facts["mode"] == "drive":
        how = f"it's about {facts['minutes']} minutes in the car"
    elif first and first.get("line"):
        how = f"the {first['line']} from {first['from']} to {first['to']}" if first.get("from") else f"the {first['line']}"
        if len(facts["rides"]) > 1:
            how += ", then one change"
        if facts["walk_minutes"]:
            how += f", about {facts['walk_minutes']} minutes on foot all in"
    else:
        how = f"it's about {facts['minutes']} minutes"
    return f"(leave by {facts['leave']}. {how}. you're there by {facts['arrive']}.)"


TRIP_PROMPT = """You write one short note for an actor about getting to an audition, in the voice of a stage direction.
Rules: one sentence or two, inside parentheses, all lowercase except names of lines and stations, no dashes of any kind, no emojis, under 45 words.
It must say "leave by {leave}". Use only the facts below. Never invent a line, station, entrance or street. If the address or the notes mention something about the building (a buzzer, a floor, a side door, sign in at the lobby), you may add it.
Return JSON: {{"line": "(...)"}}

Facts: {facts}
Address: {address}
Notes from the casting email: {notes}"""


def trip_inputs(a: Audition, origin: Optional[str], mode: Optional[str]) -> Optional[tuple[str, str, datetime]]:
    """(origin, mode, appointment) when a trip can be planned, else None."""
    if a.kind != "in_person" or not a.location or not origin or a.starts_at is None:
        return None
    return origin, (mode if mode in ("transit", "drive") else "transit"), core.aware(a.starts_at)


def plan_trip(
    db: Session,
    a: Audition,
    origin: Optional[str],
    mode: Optional[str],
    *,
    routes_call: Optional[RoutesCall] = None,
    llm_call: Optional[LlmCall] = None,
) -> Optional[dict]:
    inputs = trip_inputs(a, origin, mode)
    if inputs is None:
        return None
    origin, mode, starts = inputs
    key = _key("trip", origin, a.location, starts.isoformat(), mode)
    saved = (a.assist or {}).get("trip") if isinstance(a.assist, dict) else None
    if isinstance(saved, dict) and saved.get("key") == key:
        return saved

    arrive = starts - timedelta(minutes=ARRIVE_EARLY_MIN)
    route = (routes_call or _default_routes_call)(origin, a.location, mode, arrive)
    if not route:
        return None
    leave_at = arrive - timedelta(minutes=route["minutes"])
    facts = {
        "mode": mode, "minutes": route["minutes"], "rides": route["rides"], "walk_minutes": route["walk_minutes"],
        "leave": _clock(leave_at, a.tz), "arrive": _clock(arrive, a.tz), "appointment": _clock(starts, a.tz),
    }
    line = plain_trip_line(facts)
    raw = _ask_json(llm_call or _default_llm_call, TRIP_PROMPT.format(
        leave=facts["leave"], facts=json.dumps(facts), address=a.location, notes=(a.notes or "none")[:1500],
    ))
    written = _no_dashes(str((raw or {}).get("line") or ""))
    if written and f"leave by {facts['leave']}" in written.lower() and len(written) <= 320:
        line = written if written.startswith("(") else f"({written.strip('()')})"

    trip = {
        "key": key,
        "line": line,
        "mode": mode,
        "minutes": route["minutes"],
        "leave_at": leave_at.isoformat(),
        "arrive_by": arrive.isoformat(),
        "points": sketch_points(decode_polyline(route["polyline"])),
        "from_label": (route["rides"][0].get("from") if route["rides"] else None),
        "to_label": a.location.split(",")[0][:40],
        "maps_url": maps_link(a.location, origin, mode),
    }
    _save(db, a, "trip", trip)
    return trip


def maps_link(destination: str, origin: Optional[str] = None, mode: Optional[str] = None) -> str:
    """Google Maps directions. With no origin the phone's own location is the start."""
    url = f"https://www.google.com/maps/dir/?api=1&destination={quote_plus(destination)}"
    if origin:
        url += f"&origin={quote_plus(origin)}"
    url += "&travelmode=" + ("driving" if mode == "drive" else "transit")
    return url


# ---------- a read on the scene, and what to wear ----------


READ_PROMPT = """You are a working acting coach writing in an actor's notebook before an audition.
Audition: {project}. Role: {role}. Type: {kind}. What they asked for: {material}. Shoot details: {shoots}.
{sides_block}
Return JSON with two keys:
"read": {read_rule}
"wear": a list of 2 or 3 short practical things to wear or bring for this role and room (under 8 words each, no brands, nothing already listed here: {bring}).
Voice for everything: plain words, no dashes of any kind, no emojis, no exclamation marks."""

READ_RULE_SIDES = (
    'one note on how to play the scene, inside parentheses, starting "(my read:", all lowercase, under 45 words. '
    "Name the one thing the character is really fighting for and the moment the scene turns. Quote at most six words of the sides."
)
READ_RULE_NONE = "null"


def read_inputs(db: Session, a: Audition) -> tuple[Optional[str], str]:
    """(sides text or None, cache key). Sides still loading count as none for now."""
    _, status, text = core.sides_text(db, a)
    sides = (text or "").strip() if status in (None, "completed") else ""
    return (sides or None), _key("read", a.user_script_id, bool(sides), a.project, a.role, a.material_raw, a.kind)


def read_scene(db: Session, a: Audition, *, llm_call: Optional[LlmCall] = None) -> Optional[dict]:
    sides, key = read_inputs(db, a)
    if not sides and not (a.role or a.material_raw):
        return None
    saved = (a.assist or {}).get("read") if isinstance(a.assist, dict) else None
    if isinstance(saved, dict) and saved.get("key") == key:
        return saved

    items = core.bring_items(a)
    prompt = READ_PROMPT.format(
        project=a.project, role=a.role or "not given", kind=a.kind, material=a.material_raw or "not given",
        shoots=a.shoots or "not given",
        sides_block=f"Their sides:\n<<<\n{sides[:SIDES_CHARS_FOR_MODEL]}\n>>>" if sides else "No sides yet.",
        read_rule=READ_RULE_SIDES if sides else READ_RULE_NONE,
        bring=", ".join(i["text"] for i in items) or "nothing",
    )
    raw = _ask_json(llm_call or _default_llm_call, prompt)
    if raw is None:
        return None
    line = _no_dashes(str(raw.get("read") or "")) if sides and isinstance(raw.get("read"), str) else None
    if line and not line.startswith("("):
        line = f"({line})"
    wear = [_no_dashes(str(w))[:80] for w in (raw.get("wear") or []) if isinstance(w, str) and w.strip()][:3]

    have = {i["text"].lower() for i in items}
    added = [{"text": w[:1].upper() + w[1:], "done": False, "src": "ai"} for w in wear if w.lower() not in have]
    if added:
        a.bring_list = core.clean_bring_list(items + added)
        flag_modified(a, "bring_list")
    read = {"key": key, "line": line, "wear": wear}
    _save(db, a, "read", read)
    return read


# ---------- ask me ----------


ASK_PROMPT = """You help one actor with one audition. Answer their question in under 90 words, in plain words, as "I".
No dashes of any kind, no emojis. Use only what is below and general, well known practice for auditions.
If the answer depends on something not here (a casting director's habits, a building you do not know), say plainly that you don't know from what's here, and say what you would check.
Return JSON: {{"answer": "..."}}

The audition: {facts}
{sides_block}
Earlier questions: {earlier}

Question: {question}"""


def asks_quota(db: Session, user_id: int, now: datetime) -> dict:
    from app.models.user_event import UserEvent
    from app.services.auditions.parse import _tier

    tier = _tier(db, user_id)
    limit = ASKS_PER_MONTH[tier]
    start = now.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    used = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id, UserEvent.event_name == "audition_asked", UserEvent.created_at >= start)
        .count()
    )
    return {"used": used, "limit": limit, "remaining": max(0, limit - used), "tier": tier}


def ask(db: Session, a: Audition, question: str, now: datetime, *, llm_call: Optional[LlmCall] = None) -> Optional[dict]:
    """{q, a, at} saved on the audition, or None when the model failed."""
    question = question.strip()[:500]
    sides, _ = read_inputs(db, a)
    saved = (a.assist or {}).get("asks") if isinstance(a.assist, dict) else None
    asks = list(saved) if isinstance(saved, list) else []
    trip = (a.assist or {}).get("trip") if isinstance(a.assist, dict) else None
    facts = {
        "project": a.project, "role": a.role, "kind": a.kind, "when": core._iso(core.when(a)), "timezone": a.tz,
        "where": a.location, "casting": a.casting, "through": a.through, "asked_for": a.material_raw,
        "bring": [i["text"] for i in core.bring_items(a)], "shoots": a.shoots, "notes": a.notes,
        "getting_there": trip.get("line") if isinstance(trip, dict) else None,
    }
    raw = _ask_json(llm_call or _default_llm_call, ASK_PROMPT.format(
        facts=json.dumps(facts, default=str),
        sides_block=f"Their sides:\n<<<\n{sides[:SIDES_CHARS_FOR_MODEL]}\n>>>" if sides else "No sides attached.",
        earlier=json.dumps([{"q": x.get("q"), "a": x.get("a")} for x in asks[-3:]]),
        question=question,
    ))
    answer = _no_dashes(str((raw or {}).get("answer") or ""))
    if not answer:
        return None
    entry = {"q": question, "a": answer[:1200], "at": now.isoformat()}
    _save(db, a, "asks", (asks + [entry])[-ASKS_KEPT:])
    return entry
