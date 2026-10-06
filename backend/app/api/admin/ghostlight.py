"""The Ghost Light iOS app, as the backend sees it.

Installs and store impressions live in App Store Connect and never reach us.
What does reach us is RevenueCat: a webhook per purchase, renewal, cancellation
and expiry, each granting or revoking the `monologues` tier and (since
2026-10-06) writing an `app_subscription_event` row. This endpoint is that
trail in one place, because for six weeks it was empty and nobody knew: every
delivery failed on auth while two people paid Apple and hit the free wall.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.billing import PricingTier, UserSubscription
from app.models.user import User
from app.models.user_event import UserEvent

router = APIRouter(prefix="/api/admin", tags=["admin", "ghostlight"])

# App Store list prices for the Monologues tier, in dollars. RevenueCat reports
# proceeds after Apple's cut; this is what the actor pays, so it matches the
# web MRR figure's basis.
MONTHLY_PRICE = 4.99
ANNUAL_PRICE = 29.99


def _monthly_value(billing_period: str | None) -> float:
    if billing_period == "annual":
        return round(ANNUAL_PRICE / 12, 2)
    return MONTHLY_PRICE


@router.get("/ghostlight")
def ghostlight_overview(db: Session = Depends(get_db), _=Depends(require_moderator)):
    now = datetime.now(timezone.utc)
    monologues = db.query(PricingTier).filter(PricingTier.name == "monologues").first()

    subs = (
        db.query(UserSubscription, User)
        .join(User, User.id == UserSubscription.user_id)
        .filter(UserSubscription.source == "revenuecat")
        .order_by(desc(UserSubscription.updated_at))
        .all()
    )

    rows = []
    active_paid = 0
    mrr = 0.0
    for sub, user in subs:
        on_tier = monologues is not None and sub.tier_id == monologues.id
        paying = on_tier and sub.status == "active"
        if paying:
            active_paid += 1
            mrr += _monthly_value(sub.billing_period)
        rows.append(
            {
                "user_id": user.id,
                "email": user.email,
                "name": user.name or "",
                "tier": "monologues" if on_tier else "free",
                "status": sub.status,
                "billing_period": sub.billing_period or "",
                "cancel_at_period_end": bool(sub.cancel_at_period_end),
                "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
                "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
            }
        )

    since = now - timedelta(days=30)
    events = (
        db.query(UserEvent, User)
        .join(User, User.id == UserEvent.user_id)
        .filter(UserEvent.event_name == "app_subscription_event")
        .order_by(desc(UserEvent.created_at))
        .limit(100)
        .all()
    )
    event_rows = []
    by_type_30d: dict[str, int] = {}
    for ev, user in events:
        p = ev.properties or {}
        if ev.created_at and ev.created_at >= since:
            by_type_30d[p.get("type", "?")] = by_type_30d.get(p.get("type", "?"), 0) + 1
        event_rows.append(
            {
                "at": ev.created_at.isoformat() if ev.created_at else None,
                "user_id": user.id,
                "email": user.email,
                "type": p.get("type", ""),
                "product_id": p.get("product_id", ""),
                "period_type": p.get("period_type", ""),
                "environment": p.get("environment", ""),
                "price": p.get("price", ""),
                "expires_at": p.get("expires_at", ""),
            }
        )

    last_event_at = event_rows[0]["at"] if event_rows else None

    return {
        "summary": {
            "active_paid": active_paid,
            "cancelling": sum(1 for r in rows if r["cancel_at_period_end"] and r["status"] == "active"),
            "past_due": sum(1 for r in rows if r["status"] == "past_due"),
            "expired": sum(1 for r in rows if r["status"] == "expired"),
            "mrr_list_price": round(mrr, 2),
            "events_30d": by_type_30d,
            "last_event_at": last_event_at,
            "webhook_url": "/api/webhooks/revenuecat",
        },
        "subscriptions": rows,
        "events": event_rows,
    }
