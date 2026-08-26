"""Day-1 "you saved a piece" re-engagement — selection + send.

Backs H-14 (savers return 2.1x more). A free user who saved a monologue and
didn't come back gets one short, human nudge to actually work it.

Timezone: none is stored per user, so `active_hour` is a timezone-free proxy for
"send when they're awake" — people save during their own daytime, so replaying at
that same UTC hour-of-day lands in their active window. The scheduler runs hourly.

Dedup is DATABASE-backed (monologue_favorites.reminder_sent_at) and CLAIMED
atomically before sending, so a restart, a redeploy, or a second worker can never
re-email anyone: only the process that wins the UPDATE...WHERE reminder_sent_at IS
NULL actually sends. Under-sending on a send error is deliberate — never a dupe.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite
from app.models.billing import PricingTier, UserSubscription
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services.email.marketing import APPLE_RELAY_DOMAIN, build_unsubscribe_url
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://actorrise.com")
SUBJECT = "you saved {character} and never opened it"


def _paid_user_ids(db) -> set[int]:
    rows = (
        db.query(UserSubscription.user_id)
        .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
        .filter(UserSubscription.status.in_(["active", "trialing"]), PricingTier.name != "free")
        .all()
    )
    return {r[0] for r in rows}


def _has_activity_since(db, uid: int, since: datetime) -> bool:
    if db.query(SearchLog.id).filter(SearchLog.user_id == uid, SearchLog.created_at > since).first():
        return True
    if db.query(MonologueView.id).filter(MonologueView.user_id == uid, MonologueView.created_at > since).first():
        return True
    return False


def select_candidates(db, hours_min: int, hours_max: int, active_hour: int | None) -> list[dict]:
    """Eligible (favorite, user, piece) rows, most-recent qualifying save per user.

    active_hour (0-23 UTC): only saves that landed in that hour of day, so an
    hourly run hits each person near the time of day they actually use the app.
    """
    now = datetime.now(timezone.utc)
    lo, hi = now - timedelta(hours=hours_max), now - timedelta(hours=hours_min)
    favs = (
        db.query(MonologueFavorite)
        .filter(
            MonologueFavorite.removed_at.is_(None),
            MonologueFavorite.reminder_sent_at.is_(None),  # DB dedup
            MonologueFavorite.created_at >= lo,
            MonologueFavorite.created_at <= hi,
        )
        .order_by(MonologueFavorite.user_id, MonologueFavorite.created_at.desc())
        .all()
    )
    paid = _paid_user_ids(db)
    dnc = {row[0].lower() for row in db.query(EmailDoNotContact.email).all() if row[0]}

    seen: set[int] = set()
    out: list[dict] = []
    for fav in favs:
        uid = fav.user_id
        if uid in seen:
            continue
        seen.add(uid)
        if active_hour is not None and fav.created_at is not None and fav.created_at.hour != active_hour:
            continue
        user = db.get(User, uid)
        if not user or not user.email:
            continue
        email = user.email
        if not getattr(user, "marketing_opt_in", False):
            continue
        if "@actorrise.com" in email.lower() or APPLE_RELAY_DOMAIN in email.lower():
            continue
        if email.lower() in dnc or uid in paid:
            continue
        if _has_activity_since(db, uid, fav.created_at):
            continue
        mono = db.get(Monologue, fav.monologue_id)
        if not mono or not mono.play:
            continue
        out.append({
            "favorite_id": fav.id,
            "email": email,
            "user_name": getattr(user, "name", None),
            "character": mono.character_name or "that character",
            "play": mono.play.title or "the play",
            "link": f"{SITE_URL}/monologue/{mono.id}",
            "saved_at": fav.created_at,
        })
    return out


def _claim(db, favorite_id: int) -> bool:
    """Atomically mark the reminder sent. True only for the caller that won the
    race (reminder_sent_at was still NULL). This is what makes send-at-most-once
    hold across restarts and workers."""
    res = db.execute(
        update(MonologueFavorite)
        .where(MonologueFavorite.id == favorite_id, MonologueFavorite.reminder_sent_at.is_(None))
        .values(reminder_sent_at=datetime.now(timezone.utc))
    )
    db.commit()
    return (res.rowcount or 0) == 1


def run_reminders(
    *,
    send: bool = False,
    active_hour: int | None = None,
    hours_min: int = 24,
    hours_max: int = 72,
    limit: int = 0,
    cap: int = 200,
) -> dict:
    """Select and (optionally) send. Returns stats. Opens its own session so it
    is safe to call from the scheduler thread or a CLI. `cap` is a runaway guard
    on how many can go out in one run."""
    db = SessionLocal()
    try:
        people = select_candidates(db, hours_min, hours_max, active_hour)
        if limit:
            people = people[:limit]
        stats = {"eligible": len(people), "sent": 0, "failed": 0, "previews": people}
        if not send:
            return stats

        tpl = EmailTemplates()
        client = ResendEmailClient()
        for p in people:
            if stats["sent"] >= cap:
                logger.warning("saved_piece_reminder: hit cap %s, stopping", cap)
                break
            if not _claim(db, p["favorite_id"]):
                continue  # someone else already sent this one
            try:
                unsub = None
                try:
                    unsub = build_unsubscribe_url(p["email"])
                except Exception:
                    pass
                html = tpl.render_saved_piece_reminder(p["character"], p["play"], p["link"], p["user_name"], unsubscribe_url=unsub)
                plain = tpl.render_saved_piece_reminder_plain(p["character"], p["play"], p["link"], p["user_name"])
                client.send_email(
                    to=p["email"],
                    subject=SUBJECT.format(character=p["character"], play=p["play"]),
                    html=html,
                    plain_text=plain,
                    unsubscribe_url=unsub,
                )
                stats["sent"] += 1
            except Exception as exc:  # noqa: BLE001
                # Claimed-but-not-sent: we under-send rather than risk a dupe.
                stats["failed"] += 1
                logger.warning("saved_piece_reminder: send failed for %s: %s", p["email"], exc)
        return stats
    finally:
        db.close()
