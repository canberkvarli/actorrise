"""Emails anchored on something a person did, not on when they signed up.

lifecycle.py sends day3 and day10 to everyone, counted from signup. By
2026-09-29 those two had gone out 681 times and brought back about 1 in 320.
These go to a different population: people who looked at a price.

    checkout_abandoned      2h after checkout_started, unless it finished
    paywall_seen_no_trial   1 day after a free limit stopped them, unless they
                            have started a checkout since

Sent in that order, which is the order of how close the person got to paying.

Nothing here is about a trial ending. Two such emails were written and both
were removed on 2026-09-29, on Canberk's call, before the switch was ever on:
trial_ended_no_pay (a day after a trial lapsed) and trial_ending (a heads-up
before the card is charged). So an actor on a trial hears nothing from this app
before or after the charge. Stripe's three-day warning still reaches the
founder, and only the founder (notifications.send_trial_ending_notification).

Guardrails, shared with lifecycle.py and imported from it rather than copied:
real emails only, marketing_opt_in, not staff, not paying, not on the
do-not-contact list, claimed in lifecycle_email_sends before the send so a
redeploy can never re-email. On top of those:

    - no more than lifecycle.WEEKLY_CAP lifecycle emails of any kind in 7 days
    - nothing within lifecycle.MIN_GAP_HOURS of the last one
    - each touch once per person, ever (the table's UNIQUE)

The words live in backend/emails/lifecycle/<touch>.txt. Ships OFF: nothing
sends until app_settings.TRIGGERED_EMAILS_ENABLED is switched on in
/admin/emails. Under-sending on error is deliberate.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from markupsafe import Markup, escape

from app.core.database import SessionLocal
from app.models.billing import UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.lifecycle_email import LifecycleEmailSend
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.email import lifecycle
from app.services.email.marketing import build_unsubscribe_url
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates
from app.services.events import record_user_event

logger = logging.getLogger(__name__)

COPY_DIR = Path(__file__).resolve().parents[3] / "emails" / "lifecycle"

@dataclass(frozen=True)
class Trigger:
    wait_hours: int
    # How long after the wait the email may still go. Wide enough that an
    # hourly scheduler which was down overnight still catches the person.
    window_hours: int
    # Stored in lifecycle_email_sends.anchor, which is 16 characters.
    anchor: str
    # The email offers the first-time trial, which checkout refuses to anyone
    # who has held a Stripe subscription before.
    offers_trial: bool = False


TRIGGERS: dict[str, Trigger] = {
    "checkout_abandoned": Trigger(2, 24, "checkout", offers_trial=True),
    "paywall_seen_no_trial": Trigger(24, 72, "wall", offers_trial=True),
}
PRIORITY: tuple[str, ...] = tuple(TRIGGERS)


_aware = lifecycle._aware


def _events(db, names: tuple[str, ...], lo: datetime, hi: datetime | None = None) -> list[UserEvent]:
    q = db.query(UserEvent).filter(
        UserEvent.event_name.in_(names),
        UserEvent.user_id.isnot(None),
        UserEvent.created_at >= lo,
    )
    if hi is not None:
        q = q.filter(UserEvent.created_at <= hi)
    return q.order_by(UserEvent.created_at.asc()).all()


def _is_wall(event: UserEvent) -> bool:
    if event.event_name == "upgrade_modal_viewed":
        return True  # only walls ever sent this name
    return (event.properties or {}).get("kind") == "wall"


def _anchors(db, touch: str, lo: datetime, hi: datetime) -> dict[int, datetime]:
    """user_id -> when the thing happened, for everyone still owed this touch."""
    if touch == "checkout_abandoned":
        started = _events(db, ("checkout_started",), lo, hi)
        finished = _events(db, ("checkout_completed",), lo)
        # Both ascending, so the last write per person is their latest.
        latest = {e.user_id: _aware(e.created_at) for e in started}
        done = {e.user_id: _aware(e.created_at) for e in finished}
        # Walked away unless a checkout finished at or after their latest start.
        return {uid: at for uid, at in latest.items() if uid not in done or done[uid] < at}

    if touch == "paywall_seen_no_trial":
        walls: dict[int, datetime] = {}
        for e in _events(db, ("paywall_hit", "upgrade_modal_viewed"), lo, hi):
            if _is_wall(e):
                walls.setdefault(e.user_id, _aware(e.created_at))  # asc, so the first wins
        went = {e.user_id: _aware(e.created_at) for e in _events(db, ("checkout_started",), lo)}
        return {uid: at for uid, at in walls.items() if not (uid in went and went[uid] >= at)}

    raise ValueError(f"unknown touch {touch!r}; one of {sorted(TRIGGERS)}")


def _blocked_emails(db) -> set[str]:
    return {row[0].lower() for row in db.query(EmailDoNotContact.email).all() if row[0]}


def _has_held_a_subscription(db) -> set[int]:
    rows = (
        db.query(UserSubscription.user_id)
        .filter(UserSubscription.stripe_subscription_id.isnot(None))
        .all()
    )
    return {r[0] for r in rows}


def trial_span_for(db, user_id: int) -> str:
    from app.services.trial_length import EARNED_TRIAL_DAYS, trial_days_for

    return "two weeks" if trial_days_for(db, user_id) == EARNED_TRIAL_DAYS else "a week"


def _link(touch: str) -> str:
    # /trial is a redirect to the checkout (next.config.ts). These are plain
    # text, so the address is read, and the checkout's own is four parameters.
    return f"{lifecycle.SITE_URL}/trial?e={touch}"


def select_candidates(db, touch: str, now: datetime | None = None) -> list[dict]:
    """Everyone owed this touch right now, one dict each, oldest anchor first."""
    if touch not in TRIGGERS:
        raise ValueError(f"unknown touch {touch!r}; one of {sorted(TRIGGERS)}")
    trigger = TRIGGERS[touch]
    now = now or datetime.now(timezone.utc)
    hi = now - timedelta(hours=trigger.wait_hours)
    lo = hi - timedelta(hours=trigger.window_hours)

    anchors = _anchors(db, touch, lo, hi)
    if not anchors:
        return []

    already = {
        r[0]
        for r in db.query(LifecycleEmailSend.user_id)
        .filter(LifecycleEmailSend.touch == touch)
        .all()
    }
    paid = lifecycle._paid_user_ids(db)
    blocked = _blocked_emails(db)
    former = _has_held_a_subscription(db) if trigger.offers_trial else set()

    users = db.query(User).filter(User.id.in_(anchors)).all()
    out: list[dict] = []
    for user in sorted(users, key=lambda u: anchors[u.id]):
        if user.id in already or user.id in former:
            continue
        if not lifecycle._mailable(user, blocked, paid):
            continue
        if not lifecycle.has_room(db, user.id, now):
            continue
        out.append(
            {
                "user_id": user.id,
                "email": user.email,
                "user_name": getattr(user, "name", None),
                "touch": touch,
                "anchor": trigger.anchor,
                "anchored_at": anchors[user.id],
                "link": _link(touch),
                "span": trial_span_for(db, user.id),
            }
        )
    return out


def load_copy(touch: str) -> tuple[str, str]:
    """(subject, body) from backend/emails/lifecycle/<touch>.txt."""
    raw = (COPY_DIR / f"{touch}.txt").read_text(encoding="utf-8")
    head, _, body = raw.partition("\n")
    label, _, subject = head.partition(":")
    if label.strip().lower() != "subject" or not subject.strip():
        raise ValueError(f"{touch}.txt must open with 'subject: ...'")
    return subject.strip(), body.strip() + "\n"


def _fill(text: str, name: str, link, span: str) -> str:
    greeting = f"hey {name}," if name else "hey,"
    return (
        text.replace("hey {name},", greeting)
        .replace("{name}", name)
        .replace("{span}", span)
        .replace("{link}", link)
    )


def render(person: dict, unsubscribe_url: str | None, tpl: EmailTemplates | None = None) -> tuple[str, str, str]:
    """(subject, html, plain) for one candidate."""
    subject, body = load_copy(person["touch"])
    name = (EmailTemplates._first_name(person.get("user_name")) or "").lower()
    link, span = person["link"], person["span"]

    plain = _fill(body, name, link, span)

    # The same words as a letter: one <p> per paragraph, everything escaped,
    # and the link the only markup. The letter ends on the name; the way out
    # is the unsubscribe link base_personal prints underneath, and the
    # List-Unsubscribe header the client sets.
    anchor = Markup('<a href="{0}" style="font-weight:500;">{0}</a>').format(link)
    paragraphs = [
        Markup(_fill(str(escape(block)), str(escape(name)), str(anchor), str(escape(span))))
        for block in body.strip().split("\n\n")
    ]
    html = (tpl or EmailTemplates()).env.get_template("triggered.html").render(
        subject=subject, paragraphs=paragraphs, unsubscribe_url=unsubscribe_url
    )
    return subject, html, plain


def run_touch(
    touch: str,
    *,
    send: bool = False,
    cap: int = 50,
    now: datetime | None = None,
    skip: set[int] | None = None,
) -> dict:
    """Select and (optionally) send one touch. Own session, safe from a thread or CLI.

    `skip` holds the people an earlier, higher-priority touch already took in
    this run, and is added to as this one takes its own.
    """
    skip = skip if skip is not None else set()
    db = SessionLocal()
    try:
        people = [p for p in select_candidates(db, touch, now) if p["user_id"] not in skip]
        skip.update(p["user_id"] for p in people)
        stats = {"touch": touch, "eligible": len(people), "sent": 0, "failed": 0, "previews": people}
        if not send:
            return stats

        tpl = EmailTemplates()
        client = ResendEmailClient()
        for p in people:
            if stats["sent"] >= cap:
                logger.warning("triggered %s: hit cap %s, stopping", touch, cap)
                break
            if not lifecycle._claim(db, p["user_id"], touch, p["anchor"]):
                continue
            try:
                unsub = None
                try:
                    unsub = build_unsubscribe_url(p["email"])
                except Exception:
                    pass
                subject, html, plain = render(p, unsub, tpl)
                client.send_email(
                    to=p["email"], subject=subject, html=html, plain_text=plain, unsubscribe_url=unsub
                )
                stats["sent"] += 1
                record_user_event(p["user_id"], "email_sent", {"touch": touch})
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                logger.warning("triggered %s: send failed for %s: %s", touch, p["email"], exc)
        return stats
    finally:
        db.close()


def run_all(*, send: bool = False, now: datetime | None = None) -> list[dict]:
    taken: set[int] = set()
    return [run_touch(t, send=send, now=now, skip=taken) for t in PRIORITY]
