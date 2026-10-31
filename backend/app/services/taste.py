"""Three days of Plus, no card, the first time a free actor runs out of reads.

Why (2026-10-21, last 30 days): 276 people opened a monologue and 49 of them
reached the 5-read wall. Seven started a Stripe checkout and one finished; the
other real sessions all stopped at the card form. Five of the six web payers
only ever use the library. So the people worth asking are the ones at the wall,
and the card is what stops them. Spec:
docs/superpowers/specs/2026-10-21-three-day-taste-design.md.

A taste is an ordinary comp row (no Stripe id, ``trial_end`` 72 hours out,
``source="taste"``), so ``UserSubscription.is_active`` ends it by itself. Once
per person, ever: the ``taste_started`` user_event, written in the same
transaction as the grant, is the record. After a taste, checkout gives no
trial; the next wall asks for the money.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.models.billing import BillingHistory, PricingTier, UserSubscription
from app.models.user_event import UserEvent

logger = logging.getLogger(__name__)

TASTE_HOURS = 72
SOURCE = "taste"
EVENT = "taste_started"
# Teachers and students already get a month on the house through their class.
_COMPED_ACCOUNT_TYPES = {"educator", "student"}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def had_taste(db, user_id: int) -> bool:
    return (
        db.query(UserEvent.id)
        .filter(UserEvent.user_id == user_id, UserEvent.event_name == EVENT)
        .first()
        is not None
    )


def is_eligible(db, user) -> bool:
    """Free now, never paid on the web, no app subscription, no comp, no taste yet."""
    if (getattr(user, "account_type", None) or "").lower() in _COMPED_ACCOUNT_TYPES:
        return False
    uid = int(user.id)
    sub = db.query(UserSubscription).filter(UserSubscription.user_id == uid).first()
    if sub is not None:
        tier = db.query(PricingTier).get(sub.tier_id) if sub.tier_id else None
        if sub.is_active and tier is not None and tier.name != "free":
            return False  # on Plus, a comp, or a trial already
        # Anyone Stripe or the App Store has ever written a subscription for has
        # had their trial or paid. Never touch those rows.
        if sub.stripe_subscription_id or (sub.source or "") in ("stripe", "revenuecat", SOURCE):
            return False
    paid = (
        db.query(BillingHistory.id)
        .filter(
            BillingHistory.user_id == uid,
            BillingHistory.status.in_(["succeeded", "paid"]),
            BillingHistory.amount_cents > 0,
        )
        .first()
    )
    if paid is not None:
        return False
    return not had_taste(db, uid)


def grant(
    db,
    user,
    platform: Optional[str] = None,
    *,
    hours: int = TASTE_HOURS,
    reason: str = "read_wall",
) -> Optional[datetime]:
    """Give three days of Plus if eligible. Returns when it ends, or None.

    Never raises: a failure here must leave the reader at the ordinary wall,
    not on an error page.
    """
    try:
        if not is_eligible(db, user):
            return None
        plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
        if plus is None:
            return None
        uid = int(user.id)
        end = datetime.now(timezone.utc) + timedelta(hours=hours)
        sub = db.query(UserSubscription).filter(UserSubscription.user_id == uid).first()
        if sub is None:
            sub = UserSubscription(user_id=uid, tier_id=plus.id)
            db.add(sub)
        sub.tier_id = plus.id
        sub.status = "trialing"
        sub.trial_end = end
        sub.current_period_end = end
        sub.source = SOURCE
        sub.cancel_at_period_end = False
        sub.canceled_at = None
        sub.billing_period = sub.billing_period or "monthly"
        db.add(UserEvent(
            user_id=uid,
            event_name=EVENT,
            properties={"client_platform": platform, "hours": hours, "reason": reason},
        ))
        db.commit()
        return end
    except Exception as exc:  # noqa: BLE001
        logger.warning("taste: grant failed for user %s: %s", getattr(user, "id", None), exc)
        try:
            db.rollback()
        except Exception:
            pass
        return None


def status(db, user_id: int) -> dict[str, Any]:
    """What /me reports: had one, is it running, when it ends."""
    try:
        had = had_taste(db, user_id)
        if not had:
            return {"had": False, "active": False, "ends_at": None}
        sub = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()
        running = bool(sub and sub.source == SOURCE and sub.is_active)
        ends = _aware(sub.trial_end) if running else None
        return {"had": True, "active": running, "ends_at": ends.isoformat() if ends else None}
    except Exception as exc:  # noqa: BLE001
        logger.warning("taste: status failed for user %s: %s", user_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return {"had": False, "active": False, "ends_at": None}


def tasted_user_ids(db) -> set[int]:
    return {
        r[0]
        for r in db.query(UserEvent.user_id)
        .filter(UserEvent.event_name == EVENT, UserEvent.user_id.isnot(None))
        .all()
    }
