"""Real revenue, straight from Stripe — not derived from our subscription rows.

The DB-based "MRR" on the overview multiplies our active-subscription count by
list price, which overstates reality: our rows drift from Stripe (missed cancel
webhooks), and a subscription being "active" is not the same as cash landing.
This endpoint reports what Stripe actually shows: live active count, run-rate
MRR from real prices, and — the honest number — cash actually collected.

Cached in-process (Stripe pagination is slow); refreshes every 15 min.
"""

import os
import time
import logging

import stripe
from app.api.admin.stats import require_moderator
from app.models.user import User
from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin", "revenue"])

_TTL = 900  # 15 min
_cache: dict = {"data": None, "ts": 0.0}


def _monthly_cents(price: dict, qty) -> float:
    amt = (price.get("unit_amount") or 0) * (qty or 1)
    rec = price.get("recurring")
    if not rec:
        return 0.0
    interval, ic = rec["interval"], (rec.get("interval_count") or 1)
    if interval == "year":
        return amt / (12 * ic)
    if interval == "month":
        return amt / ic
    if interval == "week":
        return amt * 52 / 12 / ic
    if interval == "day":
        return amt * 365 / 12 / ic
    return 0.0


def _compute() -> dict:
    key = os.getenv("STRIPE_SECRET_KEY")
    if not key:
        return {"available": False, "reason": "STRIPE_SECRET_KEY not set"}
    stripe.api_key = key
    now = int(time.time())

    active = trialing = 0
    mrr_cents = 0.0
    by_interval: dict[str, int] = {}
    for sub in stripe.Subscription.list(status="active", limit=100).auto_paging_iter():
        active += 1
        for it in sub["items"]["data"]:
            price = it["price"]
            mrr_cents += _monthly_cents(price, it.get("quantity"))
            rec = price.get("recurring")
            if rec:
                by_interval[rec["interval"]] = by_interval.get(rec["interval"], 0) + 1
    for _sub in stripe.Subscription.list(status="trialing", limit=100).auto_paging_iter():
        trialing += 1

    def collected(since: int | None) -> tuple[int, int]:
        total = n = 0
        kwargs = {"status": "paid", "limit": 100}
        if since:
            kwargs["created"] = {"gte": since}
        for inv in stripe.Invoice.list(**kwargs).auto_paging_iter():
            ap = inv.get("amount_paid") or 0
            if ap > 0:
                total += ap
                n += 1
        return total, n

    c30, n30 = collected(now - 30 * 86400)
    c90, n90 = collected(now - 90 * 86400)
    life, nlife = collected(None)

    return {
        "available": True,
        "active_subscriptions": active,
        "trialing": trialing,
        "by_interval": by_interval,
        "mrr_run_rate_usd": round(mrr_cents / 100, 2),
        "collected_30d_usd": round(c30 / 100, 2),
        "collected_30d_count": n30,
        "collected_90d_usd": round(c90 / 100, 2),
        "collected_90d_count": n90,
        "collected_lifetime_usd": round(life / 100, 2),
        "collected_lifetime_count": nlife,
    }


@router.get("/stripe-revenue")
def stripe_revenue(
    refresh: bool = False,
    _mod: User = Depends(require_moderator),
) -> dict:
    """Live Stripe revenue. Cached 15 min; pass ?refresh=true to force."""
    age = time.time() - _cache["ts"]
    if _cache["data"] is not None and not refresh and age < _TTL:
        return {**_cache["data"], "cached_age_seconds": int(age)}
    try:
        data = _compute()
        _cache["data"] = data
        _cache["ts"] = time.time()
        return {**data, "cached_age_seconds": 0}
    except Exception as e:  # noqa: BLE001
        logger.warning("stripe-revenue failed: %s", e)
        if _cache["data"] is not None:
            return {**_cache["data"], "stale": True, "error": str(e)}
        return {"available": False, "reason": str(e)}
