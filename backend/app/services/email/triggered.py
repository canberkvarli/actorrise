"""Emails anchored on something a person did, not on when they signed up.

lifecycle.py sends day3 and day10 to everyone, counted from signup. By
2026-09-29 those two had gone out 681 times and brought back about 1 in 320.
These go to a different population: people who looked at a price.

    trial_ending            1 to 3 days before a Stripe trial charges the card
    checkout_abandoned      2h after checkout_started, unless it finished
    trial_ended_no_pay      1 day after a Stripe trial ended without converting
    paywall_seen_no_trial   1 day after a free limit stopped them, unless they
                            have started a checkout since

Sent in that order, which is the order of how close the person got to paying.

trial_ending is a notice, not an ask, and the rules bend for it: see
Trigger.notice. It exists because nothing told an actor their card was about to
be charged. Stripe's three-day warning reaches this app as a webhook and was
forwarded to the founder (notifications.send_trial_ending_notification); the
actor heard nothing until the charge.

Guardrails, shared with lifecycle.py and imported from it rather than copied:
real emails only, marketing_opt_in, not staff, not paying, not on the
do-not-contact list, claimed in lifecycle_email_sends before the send so a
redeploy can never re-email. On top of those:

    - no more than lifecycle.WEEKLY_CAP lifecycle emails of any kind in 7 days
    - nothing within lifecycle.MIN_GAP_HOURS of the last one
    - each touch once per person, ever (the table's UNIQUE)

The one exception to the do-not-contact list is documented on Trigger.

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
from app.models.billing import PricingTier, UserSubscription
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

# What checkout.session.completed writes for every checkout, trials included
# (api/webhooks.py). The system's row, not a request from the person.
SYSTEM_DNC_REASON = "paid_subscriber"


@dataclass(frozen=True)
class Trigger:
    wait_hours: int
    # How long after the wait the email may still go. Wide enough that an
    # hourly scheduler which was down overnight still catches the person.
    window_hours: int
    # Stored in lifecycle_email_sends.anchor, which is 16 characters.
    anchor: str
    # Everyone who has ever started a trial is on the do-not-contact list as
    # paid_subscriber, so without this nobody could be asked why they left.
    # A row with that exact reason does not block this touch. Any other
    # reason, or none, is a person's own request and always blocks.
    passes_system_dnc: bool = False
    # The email offers the first-time trial, which checkout refuses to anyone
    # who has held a Stripe subscription before.
    offers_trial: bool = False
    # A notice about money that is about to move, not a request. It goes to
    # someone who is ON a trial, so "not paying" cannot be a condition; it is
    # owed to them whether or not they opted in to marketing; and the weekly
    # cap must not be able to swallow it. It still writes its claim, so it
    # counts against the cap for everything else, and a person's own opt-out
    # or a dead address on the do-not-contact list still stops it.
    # For a notice, wait_hours and window_hours look AHEAD from now to the
    # trial's end rather than back to an event.
    notice: bool = False


TRIGGERS: dict[str, Trigger] = {
    "trial_ending": Trigger(24, 48, "trialend", passes_system_dnc=True, notice=True),
    "checkout_abandoned": Trigger(2, 24, "checkout", offers_trial=True),
    "trial_ended_no_pay": Trigger(24, 72, "trial", passes_system_dnc=True),
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

    if touch == "trial_ended_no_pay":
        return {
            e.user_id: _aware(e.created_at)
            for e in _events(db, ("trial_ended",), lo, hi)
            if (e.properties or {}).get("outcome") != "converted"
        }

    if touch == "paywall_seen_no_trial":
        walls: dict[int, datetime] = {}
        for e in _events(db, ("paywall_hit", "upgrade_modal_viewed"), lo, hi):
            if _is_wall(e):
                walls.setdefault(e.user_id, _aware(e.created_at))  # asc, so the first wins
        went = {e.user_id: _aware(e.created_at) for e in _events(db, ("checkout_started",), lo)}
        return {uid: at for uid, at in walls.items() if not (uid in went and went[uid] >= at)}

    raise ValueError(f"unknown touch {touch!r}; one of {sorted(TRIGGERS)}")


def _trials_ending(db, soonest: datetime, latest: datetime) -> dict[int, dict]:
    """user_id -> what the notice says, for Stripe trials that charge in the window.

    Stripe trials only. 34 of the 39 `trialing` rows on 2026-09-29 were manual
    comps with no Stripe subscription: nothing charges those, and telling a
    comped teacher their card is about to be billed would be a lie.
    """
    rows = (
        db.query(UserSubscription, PricingTier)
        .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
        .filter(
            UserSubscription.status == "trialing",
            UserSubscription.stripe_subscription_id.isnot(None),
            UserSubscription.trial_end.isnot(None),
            UserSubscription.trial_end > soonest,
            UserSubscription.trial_end <= latest,
        )
        .all()
    )
    out: dict[int, dict] = {}
    for sub, tier in rows:
        if sub.cancel_at_period_end:
            continue  # already cancelled: nothing will be charged
        annual = sub.billing_period == "annual"
        cents = tier.annual_price_cents if annual else tier.monthly_price_cents
        if not cents:
            continue
        ends = _aware(sub.trial_end)
        out[sub.user_id] = {
            "at": ends,
            "date": f"{ends:%A, %B} {ends.day}".lower(),
            "amount": f"${cents / 100:.2f}".replace(".00", ""),
            "every": "year" if annual else "month",
        }
    return out


def _reachable(user: User, blocked: set[str]) -> bool:
    """Can a notice be delivered to this person, and have they not said stop."""
    email = (user.email or "").lower()
    if not email or getattr(user, "exclude_from_stats", False):
        return False
    for unreal in (lifecycle.ANON_DOMAIN, "@actorrise.com", lifecycle.APPLE_RELAY_DOMAIN):
        if unreal in email:
            return False
    return email not in blocked


def _blocked_emails(db, passes_system_dnc: bool) -> set[str]:
    rows = db.query(EmailDoNotContact.email, EmailDoNotContact.reason).all()
    return {
        email.lower()
        for email, reason in rows
        if email and not (passes_system_dnc and reason == SYSTEM_DNC_REASON)
    }


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
    if touch == "trial_ending":
        return f"{lifecycle.SITE_URL}/billing?e={touch}"
    if touch == "trial_ended_no_pay":
        return f"{lifecycle.SITE_URL}/monologues?e={touch}"
    # /trial is a redirect to the checkout (next.config.ts). These are plain
    # text, so the address is read, and the checkout's own is four parameters.
    return f"{lifecycle.SITE_URL}/trial?e={touch}"


def select_candidates(db, touch: str, now: datetime | None = None) -> list[dict]:
    """Everyone owed this touch right now, one dict each, oldest anchor first."""
    if touch not in TRIGGERS:
        raise ValueError(f"unknown touch {touch!r}; one of {sorted(TRIGGERS)}")
    trigger = TRIGGERS[touch]
    now = now or datetime.now(timezone.utc)

    details: dict[int, dict] = {}
    if trigger.notice:
        details = _trials_ending(
            db,
            now + timedelta(hours=trigger.wait_hours),
            now + timedelta(hours=trigger.wait_hours + trigger.window_hours),
        )
        anchors = {uid: d["at"] for uid, d in details.items()}
    else:
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
    blocked = _blocked_emails(db, trigger.passes_system_dnc)
    former = _has_held_a_subscription(db) if trigger.offers_trial else set()

    users = db.query(User).filter(User.id.in_(anchors)).all()
    out: list[dict] = []
    for user in sorted(users, key=lambda u: anchors[u.id]):
        if user.id in already or user.id in former:
            continue
        if trigger.notice:
            if not _reachable(user, blocked):
                continue
        else:
            if not lifecycle._mailable(user, blocked, paid):
                continue
            if not lifecycle.has_room(db, user.id, now):
                continue
        extra = {k: v for k, v in details.get(user.id, {}).items() if k != "at"}
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
                **extra,
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


# What a copy file may ask for, beyond {name} and {link}.
FIELDS = ("span", "date", "amount", "every")


def _fill(text: str, name: str, link, fields: dict[str, str]) -> str:
    greeting = f"hey {name}," if name else "hey,"
    text = text.replace("hey {name},", greeting).replace("{name}", name)
    for key in FIELDS:
        text = text.replace("{" + key + "}", fields.get(key, ""))
    return text.replace("{link}", link)


def render(person: dict, unsubscribe_url: str | None, tpl: EmailTemplates | None = None) -> tuple[str, str, str]:
    """(subject, html, plain) for one candidate."""
    subject, body = load_copy(person["touch"])
    name = (EmailTemplates._first_name(person.get("user_name")) or "").lower()
    link = person["link"]
    fields = {k: str(person.get(k) or "") for k in FIELDS}

    subject = _fill(subject, name, link, fields)
    plain = _fill(body, name, link, fields)

    # The same words as a letter: one <p> per paragraph, everything escaped,
    # and the link the only markup. base_personal prints the unsubscribe link
    # underneath, as it does for day3 and day10.
    anchor = Markup('<a href="{0}" style="font-weight:500;">{0}</a>').format(link)
    safe = {k: str(escape(v)) for k, v in fields.items()}
    paragraphs = [
        Markup(_fill(str(escape(block)), str(escape(name)), str(anchor), safe))
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
