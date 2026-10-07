"""One read-only iCalendar feed per actor (RFC 5545, the subset calendars read)."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.audition import Audition
from app.services.auditions.core import aware


def _esc(s: str) -> str:
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    out, cur = [], ""
    for ch in line:
        limit = 75 if not out else 74  # continuation lines start with a space
        if len((cur + ch).encode()) > limit:
            out.append(cur)
            cur = ch
        else:
            cur += ch
    out.append(cur)
    return [out[0]] + [" " + c for c in out[1:]]


def _utc(dt: datetime) -> str:
    return aware(dt).strftime("%Y%m%dT%H%M%SZ")


def _label(a: Audition) -> str:
    return "Callback" if a.status == "callback" else "Audition"


def _event(a: Audition, now: datetime, site: str) -> list[str]:
    try:
        zone = ZoneInfo(a.tz)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        zone = ZoneInfo("UTC")
    lines = ["BEGIN:VEVENT", f"UID:audition-{a.id}@actorrise.com", f"DTSTAMP:{_utc(now)}"]
    title = f"{a.project} ({a.role})" if a.role else a.project
    if a.due_at and (a.kind == "self_tape" or not a.starts_at):
        local = aware(a.due_at).astimezone(zone)
        day = local.date()
        lines += [f"DTSTART;VALUE=DATE:{day:%Y%m%d}", f"DTEND;VALUE=DATE:{day + timedelta(days=1):%Y%m%d}"]
        word = "Tape due" if a.kind == "self_tape" else "Due"
        clock = local.strftime("%I:%M %p").lstrip("0")
        lines.append(f"SUMMARY:{_esc(f'{word} {clock}: {title}')}")
    else:
        start = aware(a.starts_at)
        lines += [f"DTSTART:{_utc(start)}", f"DTEND:{_utc(start + timedelta(hours=1))}"]
        lines.append(f"SUMMARY:{_esc(f'{_label(a)}: {title}')}")
    if a.location:
        lines.append(f"LOCATION:{_esc(a.location)}")
    desc = []
    if a.casting:
        desc.append(f"Casting: {a.casting}")
    if a.bring:
        desc.append(f"Bring: {a.bring}")
    desc.append(f"Prep: {site}/auditions/{a.id}")
    lines.append(f"DESCRIPTION:{_esc(chr(10).join(desc))}")
    lines.append("END:VEVENT")
    return lines


def build_calendar(auditions: list[Audition], *, now: datetime, site: str) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ActorRise//Auditions//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:Auditions (ActorRise)",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for a in auditions:
        if a.starts_at or a.due_at:
            lines += _event(a, now, site)
    lines.append("END:VCALENDAR")
    folded = [piece for line in lines for piece in _fold(line)]
    return "\r\n".join(folded) + "\r\n"
