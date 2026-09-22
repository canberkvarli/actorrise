"""Teachers who signed up and have not been offered anything yet.

The educator funnel works by hand: a teacher makes a free account, Canberk
emails them the free-Plus offer, they reply with a class list, he grants the
comps. The first step of that chain is the one that keeps slipping. Nothing
announces a new educator account, so the three teachers who arrived in one day
from the California Thespians eblast sat untouched for two weeks (2026-09-21 to
2026-09-23) before a manual Supabase query turned them up.

This is the announcement. One digest a day, riding the same slot as the comp
expiry digest, listing every account tagged educator in the last day that has
no comp yet. Silent when there is nobody, for the same reason the comp digest
is silent: a daily "nothing" trains you to skip the one that matters.

`created_at` is the window, not "account_type changed", because users has no
updated_at column and the wizard writes account_type within seconds of signup
anyway. A legacy account that tags itself educator months later is missed; that
is rare and the admin filter still finds it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.billing import UserSubscription
from app.models.user import User

logger = logging.getLogger(__name__)

#: A little over a day so a digest that fires a minute early never drops the
#: signup that landed right after yesterday's send.
LOOKBACK_HOURS = 26


def new_educators(db, lookback_hours: int = LOOKBACK_HOURS) -> list[dict[str, Any]]:
    """Educator accounts created in the window, newest first, with comp status."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=lookback_hours)
    users = (
        db.query(User)
        .filter(
            User.account_type == "educator",
            User.created_at >= since,
            # Test accounts and the founder's own logins are tagged in the admin.
            User.exclude_from_stats.is_(False),
        )
        .order_by(User.created_at.desc())
        .all()
    )
    if not users:
        return []

    ids = [u.id for u in users]
    active_comp_ids = {
        row.user_id
        for row in db.query(UserSubscription.user_id)
        .filter(
            UserSubscription.user_id.in_(ids),
            UserSubscription.stripe_subscription_id.is_(None),
            UserSubscription.status == "trialing",
            (UserSubscription.trial_end.is_(None)) | (UserSubscription.trial_end > now),
        )
        .all()
    }

    out: list[dict[str, Any]] = []
    for u in users:
        created = u.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        out.append(
            {
                "user_id": u.id,
                "email": u.email,
                "name": u.name or "",
                "organization": u.organization or "",
                "referral_source": u.referral_source or "",
                "referral_detail": u.referral_detail or "",
                "created_at": created,
                "has_comp": u.id in active_comp_ids,
            }
        )
    return out


def send_educator_signup_digest(db) -> int:
    """Mail the founder the day's new educator accounts. Returns rows reported.

    Never raises — it runs on the same background thread as the comp expiry
    digest, and that thread must not die.
    """
    try:
        rows = new_educators(db)
        if not rows:
            return 0
        from app.services.email.notifications import send_educator_signup_notification

        send_educator_signup_notification(rows)
        return len(rows)
    except Exception as e:  # noqa: BLE001
        logger.warning("educator signup digest failed (non-fatal): %s", e)
        return 0
