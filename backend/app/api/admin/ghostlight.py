"""The Ghost Light iOS app, as a page Canberk can act on.

Two sources. App Store Connect (via services/app_store_connect) for how many
people saw the listing, opened it, and installed; RevenueCat (via the webhook)
for who pays. The first is what was missing: on 2026-10-06 the store had shown
the app 398 times in three weeks and nothing here said so.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.api.admin.stats import require_moderator
from app.core.database import get_db
from app.models.app_store_daily import AppStoreDaily
from app.models.billing import PricingTier, UserSubscription
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import app_store_connect

router = APIRouter(prefix="/api/admin", tags=["admin", "ghostlight"])

# App Store list prices for the Monologues tier, in dollars: what the actor
# pays, so it sits on the same basis as the web MRR figure.
MONTHLY_PRICE = 4.99
ANNUAL_PRICE = 29.99


def _monthly_value(billing_period: str | None) -> float:
    if billing_period == "annual":
        return round(ANNUAL_PRICE / 12, 2)
    return MONTHLY_PRICE


def _store_section(db: Session) -> dict:
    cfg, missing = app_store_connect.configured()
    since = date.today() - timedelta(days=30)
    rows = db.query(AppStoreDaily).filter(AppStoreDaily.day >= since).order_by(AppStoreDaily.day).all()
    days = [
        {
            "day": r.day.isoformat(),
            "impressions": r.impressions,
            "page_views": r.page_views,
            "downloads": r.downloads,
            "redownloads": r.redownloads,
            "iap_units": r.iap_units,
            "proceeds_usd": r.proceeds_usd,
            "note": r.source_note,
        }
        for r in rows
    ]

    def total(key: str) -> int | float | None:
        vals = [d[key] for d in days if d[key] is not None]
        if not vals:
            return None
        s = sum(vals)
        return round(s, 2) if isinstance(s, float) else s

    totals = {k: total(k) for k in ("impressions", "page_views", "downloads", "redownloads", "iap_units", "proceeds_usd")}
    imp, views, dl = totals["impressions"], totals["page_views"], totals["downloads"]
    last = max((r.fetched_at for r in rows if r.fetched_at), default=None)
    return {
        "configured": cfg is not None,
        "missing_env": missing,
        "last_fetched_at": last.isoformat() if last else None,
        "days": days,
        "totals_30d": {
            **totals,
            "view_rate": round(views / imp, 3) if imp and views is not None else None,
            "install_rate": round(dl / views, 3) if views and dl is not None else None,
        },
    }


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
        if on_tier and sub.status == "active":
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
            }
        )

    # Purchases, renewals, cancellations as Apple reported them, newest first.
    # Kept short on the page: it is a receipt roll, not the headline.
    events = (
        db.query(UserEvent, User)
        .join(User, User.id == UserEvent.user_id)
        .filter(UserEvent.event_name == "app_subscription_event")
        .order_by(desc(UserEvent.created_at))
        .limit(30)
        .all()
    )
    purchases = []
    for ev, user in events:
        p = ev.properties or {}
        if p.get("environment") == "SANDBOX":
            continue
        purchases.append(
            {
                "at": ev.created_at.isoformat() if ev.created_at else None,
                "user_id": user.id,
                "who": user.name or user.email,
                "type": p.get("type", ""),
                "product_id": p.get("product_id", ""),
                "period_type": p.get("period_type", ""),
                "price": p.get("price", ""),
                "reason": p.get("reason", ""),
            }
        )

    # The webhook canary. Recording started 2026-10-06; before 14 days have
    # passed since then, silence is expected and the line stays quiet.
    recording_since = datetime(2026, 10, 6, tzinfo=timezone.utc)
    last_event_at = purchases[0]["at"] if purchases else None
    quiet_days = (now - (datetime.fromisoformat(last_event_at) if last_event_at else recording_since)).days
    webhook_warning = None
    if active_paid and quiet_days > 14:
        webhook_warning = (
            f"No purchase, renewal or cancellation has arrived from RevenueCat in {quiet_days} days "
            f"while {active_paid} people are paying. Check the webhook delivery log in RevenueCat."
        )

    return {
        "store": _store_section(db),
        "money": {
            "active_paid": active_paid,
            "cancelling": sum(1 for r in rows if r["cancel_at_period_end"] and r["status"] == "active"),
            "past_due": sum(1 for r in rows if r["status"] == "past_due"),
            "expired": sum(1 for r in rows if r["status"] == "expired"),
            "mrr_list_price": round(mrr, 2),
            "subscriptions": rows,
            "purchases": purchases,
            "webhook_warning": webhook_warning,
        },
    }


@router.get("/app-revenue")
def app_revenue(db: Session = Depends(get_db), _=Depends(require_moderator)):
    """The app's money in the Overview's terms, so web and app add up on one line.

    `cash_monthly_usd` is monthly plans at list price, the figure that recurs;
    `annual_amortised_usd` is yearly plans ÷ 12, money that already arrived as a
    lump. `proceeds_30d_usd` is what Apple actually paid out, from the Sales
    report, after its cut; it is the only one of these that is not list price.
    """
    monologues = db.query(PricingTier).filter(PricingTier.name == "monologues").first()
    subs = db.query(UserSubscription).filter(UserSubscription.source == "revenuecat").all()
    paying = 0
    cash = 0.0
    amortised = 0.0
    for sub in subs:
        if not (monologues and sub.tier_id == monologues.id and sub.status == "active"):
            continue
        paying += 1
        if sub.billing_period == "annual":
            amortised += ANNUAL_PRICE / 12
        else:
            cash += MONTHLY_PRICE
    since = date.today() - timedelta(days=30)
    proceeds = (
        db.query(AppStoreDaily.proceeds_usd)
        .filter(AppStoreDaily.day >= since, AppStoreDaily.proceeds_usd.isnot(None))
        .all()
    )
    return {
        "paying_count": paying,
        "cash_monthly_usd": round(cash, 2),
        "annual_amortised_usd": round(amortised, 2),
        "mrr_list_usd": round(cash + amortised, 2),
        "proceeds_30d_usd": round(sum(p[0] for p in proceeds), 2) if proceeds else None,
    }


@router.post("/ghostlight/sync")
def ghostlight_sync(db: Session = Depends(get_db), _=Depends(require_moderator)):
    """Pull the last 30 days from App Store Connect now. Returns what happened."""
    return app_store_connect.sync_recent(db)
