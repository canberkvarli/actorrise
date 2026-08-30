"""What ActorRise actually earns per month, straight from Stripe.

Two numbers, and only two:

  * ``mrr_now_usd``          — what active subscriptions really bill today.
  * ``mrr_after_trials_usd`` — that plus the trials, once they convert.

Why this file was rewritten
---------------------------
The old version summed ``price.unit_amount`` across active subscriptions and
called it MRR. It reported $185/mo while the business was really taking $48.75.
The gap was discounts: 10 of 17 active subscriptions carry a 100%-off coupon and
bill $0, and 2 more have no upcoming invoice at all. List price is not revenue.

Those coupons are time-limited, not permanent — all ten are the same 12-month
code expiring between Feb and May 2027. So a $0 subscription is deferred revenue
with a date on it, which is why ``coupon_expiry_worth_usd`` is reported rather
than writing the money off.

Reconstructing the discount ourselves is fragile — Stripe's newer API returns a
subscription discount as ``{"source": {"coupon": "..."}}`` rather than
``{"coupon": {...}}``, so the obvious `sub.discount.coupon.percent_off` read
comes back empty and every discounted sub silently counts at full price. That is
exactly how the $185 happened.

So we don't reconstruct anything. ``Invoice.create_preview`` asks Stripe what the
next invoice for this subscription will actually be, discounts and all, and we
normalise that to a month. It costs one API call per subscription, which is why
the whole thing is cached.

Cash already collected is deliberately not reported here. It answered a question
nobody was asking, and pulling it meant paginating the full invoice history on
every refresh.
"""

import logging
import os
import time

import stripe
from app.api.admin.stats import require_moderator
from app.models.user import User
from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin", "revenue"])

_TTL = 900  # 15 min
_cache: dict = {"data": None, "ts": 0.0}

# Above this many subscriptions, one preview call each stops being reasonable.
# We'd rather show a flagged estimate than hang the admin dashboard.
_PREVIEW_LIMIT = 200


def _to_monthly(cents: float, interval: str, interval_count: int) -> float:
    """Normalise any billing cadence to a monthly figure."""
    ic = interval_count or 1
    if interval == "year":
        return cents / (12 * ic)
    if interval == "month":
        return cents / ic
    if interval == "week":
        return cents * 52 / 12 / ic
    if interval == "day":
        return cents * 365 / 12 / ic
    return 0.0


def _cadence(sub) -> tuple[str, int]:
    items = sub["items"]["data"]
    if not items:
        return "", 1
    rec = items[0]["price"].get("recurring") or {}
    return rec.get("interval") or "", rec.get("interval_count") or 1


def _list_monthly(sub) -> float:
    """Sticker price per month — used only to show what discounts cost us."""
    interval, ic = _cadence(sub)
    total = sum(
        (it["price"].get("unit_amount") or 0) * (it.get("quantity") or 1)
        for it in sub["items"]["data"]
    )
    return _to_monthly(total, interval, ic)


def _real_monthly(sub) -> tuple[float, int | None]:
    """What Stripe will actually charge next, per month, after all discounts,
    plus when the discount holding it down runs out.

    A subscription with no upcoming invoice (cancelling, or otherwise not going
    to bill again) contributes nothing — which is the honest answer, not an
    error.

    The expiry matters: every 100%-off coupon in use here is time-limited, so a
    $0 subscription is deferred revenue with a date on it, not a write-off.
    Discounts must be expanded or Stripe returns them as bare id strings.
    """
    try:
        preview = stripe.Invoice.create_preview(
            subscription=sub["id"], expand=["discounts"]
        )
    except Exception as e:  # noqa: BLE001
        logger.info("no upcoming invoice for %s: %s", sub.get("id"), str(e)[:120])
        return 0.0, None

    interval, ic = _cadence(sub)
    monthly = _to_monthly(preview.get("amount_due") or 0, interval, ic)

    ends = [
        d.get("end")
        for d in (preview.get("discounts") or [])
        if isinstance(d, dict) and d.get("end")
    ]
    return monthly, (min(ends) if ends else None)


def _compute() -> dict:
    key = os.getenv("STRIPE_SECRET_KEY")
    if not key:
        return {"available": False, "reason": "STRIPE_SECRET_KEY not set"}
    stripe.api_key = key

    active = list(stripe.Subscription.list(status="active", limit=100).auto_paging_iter())
    trialing = list(stripe.Subscription.list(status="trialing", limit=100).auto_paging_iter())

    estimated = len(active) + len(trialing) > _PREVIEW_LIMIT

    def amount_of(sub) -> tuple[float, int | None]:
        return (_list_monthly(sub), None) if estimated else _real_monthly(sub)

    now_cents = 0.0
    paying = free = 0
    # Money currently held down by a coupon that has an end date, and when the
    # first of those dates arrives.
    coupon_cents = 0.0
    coupon_ends: list[int] = []

    for sub in active:
        m, discount_end = amount_of(sub)
        now_cents += m
        if m > 0:
            paying += 1
            continue
        free += 1
        if discount_end:
            coupon_cents += _list_monthly(sub)
            coupon_ends.append(discount_end)

    trial_cents = sum(amount_of(sub)[0] for sub in trialing)
    list_cents = sum(_list_monthly(s) for s in active)

    return {
        "available": True,
        "estimated": estimated,
        # The two numbers that matter.
        "mrr_now_usd": round(now_cents / 100, 2),
        "mrr_after_trials_usd": round((now_cents + trial_cents) / 100, 2),
        # Who makes them up.
        "paying_count": paying,
        "free_count": free,
        "trialing_count": len(trialing),
        "trial_worth_usd": round(trial_cents / 100, 2),
        # What the free-on-coupon subscriptions would be worth at list price —
        # the cost of the discounting, stated plainly instead of hidden inside
        # an inflated MRR.
        "discounted_away_usd": round(max(0.0, (list_cents - now_cents)) / 100, 2),
        # Deferred, not lost: these coupons expire on a date.
        "coupon_expiry_worth_usd": round(coupon_cents / 100, 2),
        "coupon_count_expiring": len(coupon_ends),
        "first_coupon_expiry": min(coupon_ends) if coupon_ends else None,
        "last_coupon_expiry": max(coupon_ends) if coupon_ends else None,
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
