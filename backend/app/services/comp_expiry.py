"""Comped memberships that are about to run out.

A comp and a Stripe trial are stored in the same two columns — `status =
'trialing'` with the end date in `trial_end` — but they end in opposite ways. A
Stripe trial ends by taking money, and Stripe announces it three days ahead
with `customer.subscription.trial_will_end`. A comp ends by switching off, and
announces nothing at all: there is no Stripe subscription behind it, so no
webhook can ever fire. `UserSubscription.is_active` simply starts returning
False and the teacher discovers it when their class cannot log in.

That is the gap this closes. One digest a day, only when something is actually
expiring, listing who and when.

`stripe_subscription_id IS NULL` is the test for a comp rather than
`source = 'manual'`: the grant endpoint sets both, but rows granted before that
column was populated carry a NULL source, and detaching the Stripe
subscription is the thing that makes a comp a comp.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.billing import PricingTier, UserSubscription
from app.models.user import User

logger = logging.getLogger(__name__)

#: How far ahead to look. A week is enough notice to email a teacher and hear
#: back before their students lose access.
LOOKAHEAD_DAYS = 7

#: Comps that lapsed since the last digest are reported too — an expiry nobody
#: noticed is worth more than one that has not happened yet.
LOOKBACK_HOURS = 24


def expiring_comps(
    db, within_days: int = LOOKAHEAD_DAYS, lookback_hours: int = LOOKBACK_HOURS
) -> list[dict[str, Any]]:
    """Comped memberships ending soon, or just ended. Nearest first."""
    now = datetime.now(timezone.utc)
    rows = (
        db.query(UserSubscription, User, PricingTier)
        .join(User, User.id == UserSubscription.user_id)
        .outerjoin(PricingTier, PricingTier.id == UserSubscription.tier_id)
        .filter(
            UserSubscription.stripe_subscription_id.is_(None),
            UserSubscription.status == "trialing",
            UserSubscription.trial_end.isnot(None),
            UserSubscription.trial_end >= now - timedelta(hours=lookback_hours),
            UserSubscription.trial_end <= now + timedelta(days=within_days),
        )
        .order_by(UserSubscription.trial_end.asc())
        .all()
    )

    out: list[dict[str, Any]] = []
    for sub, user, tier in rows:
        end = sub.trial_end
        if end is not None and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        hours_left = (end - now).total_seconds() / 3600 if end else 0
        out.append(
            {
                "user_id": user.id,
                "email": user.email,
                "name": user.name or "",
                "account_type": user.account_type or "",
                "organization": user.organization or "",
                "tier": tier.display_name if tier else "Plus",
                "trial_end": end,
                "expired": hours_left < 0,
                # Whole days, rounded down, so "1 day" never means 90 minutes.
                "days_left": int(hours_left // 24) if hours_left >= 0 else 0,
            }
        )
    return out


def send_comp_expiry_digest(db) -> int:
    """Mail the founder one digest of comps ending soon. Returns rows reported.

    Silent when nothing is expiring: a daily "nothing to report" trains you to
    ignore the one that matters. Never raises — it runs on a background thread
    that must not die.
    """
    try:
        rows = expiring_comps(db)
        if not rows:
            return 0
        from app.services.email.notifications import send_comp_expiry_notification

        send_comp_expiry_notification(rows)
        return len(rows)
    except Exception as e:  # noqa: BLE001
        logger.warning("comp expiry digest failed (non-fatal): %s", e)
        return 0
