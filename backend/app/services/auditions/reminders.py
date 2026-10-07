"""Three emails per audition: prep (3 days out, 6pm), eve (day before, 7pm),
after (morning after, 9am), all on the audition's own clock.

Service emails for a date the actor typed in, so they sit outside the lifecycle
cap of two a week. Their own ceiling: one audition email per person per local
day; when two collide the nearer audition wins and the other moment is skipped.
A claim row is written before the send; a failed send is not retried, because a
night-before note that arrives late is worse than none.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from markupsafe import Markup, escape
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.audition import CLOSED_STATUSES, Audition, AuditionEvent, AuditionReminderSend
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.user import User
from app.services.auditions.core import aware, count_runs, pieces_for, when
from app.services.email.marketing import build_unsubscribe_url
from app.services.email.templates import EmailTemplates
from app.services.events import record_user_event

logger = logging.getLogger(__name__)

COPY_DIR = Path(__file__).resolve().parents[3] / "emails" / "auditions"
MOMENTS = ("prep", "eve", "after")
WINDOW = timedelta(hours=6)
SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "https://api.actorrise.com")
UNREACHABLE = ("@anon.actorrise.com", "@privaterelay.appleid.com")


def _zone(a: Audition) -> ZoneInfo:
    try:
        return ZoneInfo(a.tz or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _at(a: Audition, day_offset: int, hour: int) -> datetime:
    zone = _zone(a)
    local_day = when(a).astimezone(zone).date() + timedelta(days=day_offset)
    return datetime.combine(local_day, time(hour), tzinfo=zone).astimezone(timezone.utc)


def due_moments(a: Audition, now: datetime) -> list[str]:
    w = when(a)
    if w is None or not a.reminders_on or a.deleted_at is not None or a.status in CLOSED_STATUSES:
        return []
    prep_at, eve_at, after_at = _at(a, -3, 18), _at(a, -1, 19), _at(a, 1, 9)
    prep_from = max(prep_at, aware(a.created_at))
    due = []
    if prep_from <= now < prep_from + WINDOW and now < eve_at - timedelta(hours=2):
        due.append("prep")
    # Past local midnight the copy's "tomorrow" is wrong and the day cap has
    # rolled over, so eve stops at the end of the evening, not six hours on.
    zone = _zone(a)
    if eve_at <= now < eve_at + WINDOW and now.astimezone(zone).date() < w.astimezone(zone).date():
        due.append("eve")
    if after_at <= now < after_at + WINDOW:
        due.append("after")
    return due


def load_copy(moment: str) -> tuple[str, str]:
    raw = (COPY_DIR / f"{moment}.txt").read_text(encoding="utf-8")
    head, _, body = raw.partition("\n")
    label, _, subject = head.partition(":")
    if label.strip().lower() != "subject" or not subject.strip():
        raise ValueError(f"{moment}.txt must open with 'subject: ...'")
    return subject.strip(), body.strip() + "\n"


def _clock(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0").lower().replace(":00", "")


def _fields(a: Audition, moment: str, name: str, runs: int, now: Optional[datetime] = None,
            has_material: Optional[bool] = None) -> tuple[dict, dict]:
    """(plain fields, link fields). Links are kept apart so the HTML can wrap them."""
    zone = _zone(a)
    local = when(a).astimezone(zone)
    tape = a.kind == "self_tape"
    today = (now or datetime.now(timezone.utc)).astimezone(zone).date()
    days = (local.date() - today).days if moment == "prep" else 0
    days_phrase = "in 3 days" if days >= 3 else "in 2 days" if days == 2 else "tomorrow" if days == 1 else "soon"
    when_phrase = (f"due {local:%A} at {_clock(local)}" if tape else f"{local:%A} at {_clock(local)}")
    if a.user_script_id:
        step = "your sides are loaded. run them once tonight and they'll sit better by then."
    elif a.material_raw:
        step = f"you still need a piece for it ({a.material_raw}). i pulled a few that fit."
    else:
        step = "worth deciding tonight what you're bringing."
    if tape:
        tomorrow = f"your tape for {a.project} is due tomorrow at {_clock(local)}."
    else:
        where = f" at {a.location}" if a.location else ""
        tomorrow = f"tomorrow, {_clock(local)}{where}."
    if has_material is None:
        has_material = bool(a.user_script_id)
    # Only talk about runs when there is something here to run.
    if not has_material:
        runs_line = "if you have a minute tonight, open your prep room:"
    elif runs > 1:
        runs_line = f"you've run it {runs} times. one more run before bed:"
    elif runs == 1:
        runs_line = "you've run it once. one more run before bed:"
    else:
        runs_line = "you haven't run it here yet. one run before bed:"
    fields = {
        "name": name,
        "project": a.project,
        "role_line": f" ({a.role})" if a.role else "",
        "days_phrase": days_phrase,
        "when_phrase": when_phrase,
        "step_line": step,
        "tomorrow_line": tomorrow,
        "bring_line": f" bring {a.bring}." if a.bring else "",
        "runs_line": runs_line,
    }
    base = f"{SITE_URL}/auditions/{a.id}?ar={moment}"
    out = f"{API_PUBLIC_URL}/api/auditions/outcome/{a.outcome_token}?o="
    links = {"link": base, "good": out + "good", "callback": out + "callback", "no": out + "no"}
    return fields, links


def _fill(text: str, fields: dict, links: dict) -> str:
    for k, v in {**fields, **links}.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def render(a: Audition, moment: str, user_name: Optional[str], *, runs: int,
           unsubscribe_url: Optional[str], tpl: Optional[EmailTemplates] = None,
           now: Optional[datetime] = None, has_material: Optional[bool] = None) -> tuple[str, str, str]:
    subject, body = load_copy(moment)
    name = (EmailTemplates._first_name(user_name) or "").lower()
    fields, links = _fields(a, moment, name, runs, now, has_material)
    if not name:
        body = body.replace("hey {name},", "hey,")
    subject = _fill(subject, fields, {})
    plain = _fill(body, fields, links)
    esc_fields = {k: str(escape(v)) for k, v in fields.items()}
    anchors = {k: str(Markup('<a href="{0}" style="font-weight:500;">{0}</a>').format(v)) for k, v in links.items()}
    paragraphs = [Markup(_fill(str(escape(block)), esc_fields, anchors)) for block in body.strip().split("\n\n")]
    html = (tpl or EmailTemplates()).env.get_template("triggered.html").render(
        subject=subject, paragraphs=paragraphs, unsubscribe_url=unsubscribe_url
    )
    return subject, html, plain


def _local_day(a: Audition, now: datetime) -> str:
    return now.astimezone(_zone(a)).date().isoformat()


def _claim(db: Session, a: Audition, moment: str, local_day: str) -> bool:
    try:
        db.add(AuditionReminderSend(audition_id=a.id, user_id=a.user_id, moment=moment, local_day=local_day))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _has_outcome(db: Session, auditions: list[Audition]) -> set[int]:
    """Auditions the actor already reported on, so "how did it go?" is moot:
    an outcome logged, or the ticket moved to callback once the audition was
    past. A ticket created as a callback appointment is not an answer."""
    by_id = {a.id: a for a in auditions}
    rows = (
        db.query(AuditionEvent.audition_id, AuditionEvent.kind, AuditionEvent.data, AuditionEvent.created_at)
        .filter(
            AuditionEvent.audition_id.in_(by_id),
            AuditionEvent.kind.in_(("outcome_logged", "status_changed")),
        )
        .all()
    )
    out = set()
    for aid, kind, data, created_at in rows:
        if kind == "outcome_logged":
            out.add(aid)
        elif (data or {}).get("to") == "callback" and aware(created_at) >= when(by_id[aid]):
            out.add(aid)
    return out


def select_due(db: Session, now: datetime) -> list[tuple[Audition, User, str]]:
    """(audition, user, moment) to send now, already reduced to one per person per local day."""
    lo, hi = now - timedelta(days=2), now + timedelta(days=4)
    blocked = {e.lower() for (e,) in db.query(EmailDoNotContact.email).all() if e}
    rows = (
        db.query(Audition, User)
        .join(User, User.id == Audition.user_id)
        .filter(
            Audition.deleted_at.is_(None),
            Audition.reminders_on.is_(True),
            or_(Audition.starts_at.between(lo, hi), and_(Audition.starts_at.is_(None), Audition.due_at.between(lo, hi))),
        )
        .all()
    )
    if not rows:
        return []
    # Claim reads stay scoped to the auditions and people in play, so the
    # table can grow forever without this query growing with it.
    audition_ids = {a.id for a, _ in rows}
    sent_moments = {
        (aid, m)
        for aid, m in db.query(AuditionReminderSend.audition_id, AuditionReminderSend.moment)
        .filter(AuditionReminderSend.audition_id.in_(audition_ids))
        .all()
    }
    candidates = []
    for a, u in rows:
        w = when(a)
        if w is None or not (lo <= w <= hi):
            continue
        email = (u.email or "").lower()
        if not email or email in blocked or email.endswith(UNREACHABLE):
            continue
        for moment in due_moments(a, now):
            if (a.id, moment) not in sent_moments:
                candidates.append((a, u, moment))
    if any(m == "after" for _, _, m in candidates):
        answered = _has_outcome(db, [a for a, _, m in candidates if m == "after"])
        candidates = [c for c in candidates if not (c[2] == "after" and c[0].id in answered)]
    if not candidates:
        return []
    candidates.sort(key=lambda c: abs((when(c[0]) - now).total_seconds()))
    user_ids = {u.id for _, u, _ in candidates}
    days = {_local_day(a, now) for a, _, _ in candidates}
    taken_days = {
        (uid, day)
        for uid, day in db.query(AuditionReminderSend.user_id, AuditionReminderSend.local_day)
        .filter(AuditionReminderSend.user_id.in_(user_ids), AuditionReminderSend.local_day.in_(days))
        .all()
    }
    out = []
    for a, u, moment in candidates:
        key = (u.id, _local_day(a, now))
        if key in taken_days:
            continue
        taken_days.add(key)
        out.append((a, u, moment))
    return out


def run(db: Session, *, now: Optional[datetime] = None, send: bool = False, client=None, cap: int = 200) -> dict:
    now = now or datetime.now(timezone.utc)
    due = select_due(db, now)
    stats = {"eligible": len(due), "sent": 0, "failed": 0}
    if not send:
        stats["previews"] = [(a.id, moment) for a, _, moment in due]
        return stats
    if client is None:
        from app.services.email.resend_client import ResendEmailClient

        client = ResendEmailClient()
    tpl = EmailTemplates()
    for a, u, moment in due:
        if stats["sent"] >= cap:
            logger.warning("audition reminders: hit cap %s", cap)
            break
        if not _claim(db, a, moment, _local_day(a, now)):
            continue
        try:
            unsub = None
            try:
                unsub = build_unsubscribe_url(u.email)
            except Exception:  # noqa: BLE001
                pass
            pieces = pieces_for(db, a)
            runs, _ = count_runs(db, a, pieces)
            subject, html, plain = render(a, moment, u.name, runs=runs, unsubscribe_url=unsub, tpl=tpl, now=now,
                                          has_material=bool(a.user_script_id or pieces))
            client.send_email(to=u.email, subject=subject, html=html, plain_text=plain, unsubscribe_url=unsub)
            db.add(AuditionEvent(audition_id=a.id, user_id=a.user_id, kind="reminder_sent", data={"moment": moment}))
            db.commit()
            stats["sent"] += 1
            record_user_event(a.user_id, "audition_reminder_sent", {"audition_id": a.id, "moment": moment})
        except Exception as exc:  # noqa: BLE001
            # The claim is already committed and stays; this only clears a
            # broken transaction so the next person still gets theirs.
            db.rollback()
            stats["failed"] += 1
            logger.warning("audition reminder %s failed for audition %s: %s", moment, a.id, exc)
    return stats
