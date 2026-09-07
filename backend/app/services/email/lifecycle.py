"""Day-3 and day-10 lifecycle emails: bring a new real account back once.

Why: week-2 return is near zero (2026-09-06 metrics: 13 of 124 weekly actives
were older than 7 days). The day-1 saved-piece reminder only reaches savers,
and 39 of the last 357 real signups saved anything. These two touches reach
the rest, anchored on whatever the person actually did:

    favorite  -> their latest saved piece (character, play, link)
    search    -> their latest real search, as a link that re-runs it
    none      -> a nudge to try one search, with an example query

day3  = 72h..120h after signup, one nudge back to their own thing.
day10 = 240h..312h after signup, one question: what were you hoping for?

Same guardrails as saved_piece_reminder: real emails only, marketing_opt_in,
not on the do-not-contact list, not paying, not active in the last 48h, sent
in the UTC hour they signed up (timezone proxy), claimed atomically in
lifecycle_email_sends before the send so a redeploy can never re-email.
Under-sending on error is deliberate.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite
from app.models.billing import PricingTier, UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.lifecycle_email import LifecycleEmailSend
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services.email.marketing import APPLE_RELAY_DOMAIN, build_unsubscribe_url
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
ANON_DOMAIN = "@anon.actorrise.com"

# touch -> (hours after signup: min, max). 72h wide so the hour-of-day match
# gets three chances; the claim table makes sure only one lands.
TOUCHES: dict[str, tuple[int, int]] = {
    "day3": (72, 120),
    "day10": (240, 312),
}
QUIET_HOURS = 48  # active more recently than this = already back, leave them alone
MAX_QUERY_LEN = 80

SUBJECTS = {
    "day3": {
        "favorite": "have you run {character} yet?",
        "search": "did you find one?",
        "none": "try one search",
    },
    "day10": {
        "favorite": "one question",
        "search": "one question",
        "none": "one question",
    },
}


def _paid_user_ids(db) -> set[int]:
    rows = (
        db.query(UserSubscription.user_id)
        .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
        .filter(UserSubscription.status.in_(["active", "trialing"]), PricingTier.name != "free")
        .all()
    )
    return {r[0] for r in rows}


def _active_since(db, uid: int, since: datetime) -> bool:
    if db.query(SearchLog.id).filter(SearchLog.user_id == uid, SearchLog.created_at > since).first():
        return True
    if db.query(MonologueView.id).filter(MonologueView.user_id == uid, MonologueView.created_at > since).first():
        return True
    return False


def _mailable(user: User, dnc: set[str], paid: set[int]) -> bool:
    email = (user.email or "").lower()
    if not email or not getattr(user, "marketing_opt_in", False):
        return False
    if getattr(user, "exclude_from_stats", False):
        return False
    for blocked in (ANON_DOMAIN, "@actorrise.com", APPLE_RELAY_DOMAIN):
        if blocked in email:
            return False
    return email not in dnc and user.id not in paid


def _favorite_anchor(db, uid: int) -> dict | None:
    fav = (
        db.query(MonologueFavorite)
        .filter(MonologueFavorite.user_id == uid, MonologueFavorite.removed_at.is_(None))
        .order_by(MonologueFavorite.created_at.desc())
        .first()
    )
    if fav is None:
        return None
    mono = db.get(Monologue, fav.monologue_id)
    if mono is None or mono.play is None:
        return None
    return {
        "anchor": "favorite",
        "character": mono.character_name or "that character",
        "play": mono.play.title or "the play",
        "link": f"{SITE_URL}/monologue/{mono.id}",
        "favorite_reminded_at": fav.reminder_sent_at,
    }


def _search_anchor(db, uid: int) -> dict | None:
    log = (
        db.query(SearchLog)
        .filter(SearchLog.user_id == uid, SearchLog.source == "search", SearchLog.results_count > 0)
        .order_by(SearchLog.created_at.desc())
        .first()
    )
    if log is None:
        return None
    return search_anchor_from_query(log.query)


def search_anchor_from_query(raw: str | None) -> dict | None:
    """A search anchor for a stored query string, or None if it is too short to reopen."""
    query = " ".join((raw or "").split())[:MAX_QUERY_LEN].strip()
    if len(query) < 3:
        return None
    return {"anchor": "search", "query": query, "link": f"{SITE_URL}/monologues?q={quote(query)}"}


def anchor_for(db, uid: int) -> dict:
    """What to reopen for this person: latest favorite, else latest search, else nothing."""
    return (
        _favorite_anchor(db, uid)
        or _search_anchor(db, uid)
        or {"anchor": "none", "link": f"{SITE_URL}/monologues"}
    )


def select_candidates(db, touch: str, active_hour: int | None = None) -> list[dict]:
    """Users in the touch's window who have not had it, one dict each."""
    hours_min, hours_max = TOUCHES[touch]
    now = datetime.now(timezone.utc)
    lo, hi = now - timedelta(hours=hours_max), now - timedelta(hours=hours_min)

    already = {r[0] for r in db.query(LifecycleEmailSend.user_id).filter(LifecycleEmailSend.touch == touch).all()}
    users = (
        db.query(User)
        .filter(User.created_at >= lo, User.created_at <= hi, User.marketing_opt_in.is_(True))
        .order_by(User.created_at.asc())
        .all()
    )
    paid = _paid_user_ids(db)
    dnc = {row[0].lower() for row in db.query(EmailDoNotContact.email).all() if row[0]}

    out: list[dict] = []
    for user in users:
        if user.id in already or not _mailable(user, dnc, paid):
            continue
        if active_hour is not None and user.created_at is not None and user.created_at.hour != active_hour:
            continue
        if _active_since(db, user.id, now - timedelta(hours=QUIET_HOURS)):
            continue
        anchor = anchor_for(db, user.id)
        # The day-1 saved-piece email went out within the last two days: one
        # nudge about the same piece is enough for now.
        reminded = anchor.pop("favorite_reminded_at", None)
        if touch == "day3" and reminded is not None and reminded > now - timedelta(hours=QUIET_HOURS):
            continue
        out.append(
            {
                "user_id": user.id,
                "email": user.email,
                "user_name": getattr(user, "name", None),
                "touch": touch,
                "signed_up_at": user.created_at,
                **anchor,
            }
        )
    return out


def _claim(db, user_id: int, touch: str, anchor: str) -> bool:
    """Insert the claim row. True only for the caller that won (UNIQUE held)."""
    try:
        db.add(LifecycleEmailSend(user_id=user_id, touch=touch, anchor=anchor))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def render(tpl: EmailTemplates, person: dict, unsubscribe_url: str | None) -> tuple[str, str, str]:
    """(subject, html, plain) for one candidate."""
    touch, anchor = person["touch"], person["anchor"]
    subject = SUBJECTS[touch][anchor].format(character=person.get("character", ""))
    kwargs = {
        "anchor": anchor,
        "link": person["link"],
        "character": person.get("character"),
        "play": person.get("play"),
        "query": person.get("query"),
        "user_name": person.get("user_name"),
    }
    if touch == "day3":
        html = tpl.render_lifecycle_day3(unsubscribe_url=unsubscribe_url, **kwargs)
        plain = tpl.render_lifecycle_day3_plain(**kwargs)
    else:
        html = tpl.render_lifecycle_day10(unsubscribe_url=unsubscribe_url, **kwargs)
        plain = tpl.render_lifecycle_day10_plain(**kwargs)
    return subject, html, plain


def run_touch(
    touch: str,
    *,
    send: bool = False,
    active_hour: int | None = None,
    limit: int = 0,
    cap: int = 200,
) -> dict:
    """Select and (optionally) send one touch. Own session, safe from a thread or CLI."""
    if touch not in TOUCHES:
        raise ValueError(f"unknown touch {touch!r}; one of {sorted(TOUCHES)}")
    db = SessionLocal()
    try:
        people = select_candidates(db, touch, active_hour)
        if limit:
            people = people[:limit]
        stats = {"touch": touch, "eligible": len(people), "sent": 0, "failed": 0, "previews": people}
        if not send:
            return stats

        tpl = EmailTemplates()
        client = ResendEmailClient()
        for p in people:
            if stats["sent"] >= cap:
                logger.warning("lifecycle %s: hit cap %s, stopping", touch, cap)
                break
            if not _claim(db, p["user_id"], touch, p["anchor"]):
                continue
            try:
                unsub = None
                try:
                    unsub = build_unsubscribe_url(p["email"])
                except Exception:
                    pass
                subject, html, plain = render(tpl, p, unsub)
                client.send_email(to=p["email"], subject=subject, html=html, plain_text=plain, unsubscribe_url=unsub)
                stats["sent"] += 1
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                logger.warning("lifecycle %s: send failed for %s: %s", touch, p["email"], exc)
        return stats
    finally:
        db.close()


def run_all(*, send: bool = False, active_hour: int | None = None) -> list[dict]:
    return [run_touch(t, send=send, active_hour=active_hour) for t in TOUCHES]
