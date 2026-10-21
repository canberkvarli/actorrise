"""
Pricing API endpoints (public).

Public endpoints for fetching pricing tier information.
No authentication required - used by marketing pages to display pricing.
Tiers are cached in memory to avoid repeated DB round-trips (tiers change rarely).
"""

import time
from typing import Any

from app.core.database import get_db
from app.middleware.rate_limiting import FREE_MONOLOGUE_READ_LIMIT
from app.models.billing import PricingTier
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/pricing", tags=["pricing"])

# In-memory cache for pricing tiers (small, read-heavy, rarely changing).
# TTL 5 minutes so price/plan changes propagate without restart.
_TIERS_CACHE: list[PricingTier] | None = None
_TIERS_CACHE_AT: float = 0
_TIERS_TTL_SECONDS = 300  # 5 minutes


class PricingTierResponse(BaseModel):
    """Response model for pricing tier information."""

    id: int
    name: str
    display_name: str
    description: str | None
    monthly_price_cents: int
    annual_price_cents: int | None
    features: dict[str, Any]
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


def _out(tier: PricingTier) -> PricingTierResponse:
    """The tier as served, plus the monthly read allowance.

    The read wall's number is a constant in rate_limiting, not a tier feature,
    so the pricing cards never said it. Added here so the card and the wall
    read the same number and cannot drift apart.
    """
    out = PricingTierResponse.model_validate(tier)
    reads = FREE_MONOLOGUE_READ_LIMIT if tier.name == "free" else -1
    out.features = {**(out.features or {}), "monologue_reads_per_month": reads}
    return out


def _get_tiers_uncached(db: Session) -> list[PricingTier]:
    return db.query(PricingTier).filter(PricingTier.is_active == True).order_by(PricingTier.sort_order).all()


@router.get("/tiers", response_model=list[PricingTierResponse])
async def get_pricing_tiers(db: Session = Depends(get_db)):
    """
    Get all active pricing tiers (public endpoint).

    Returns a list of all active pricing tiers sorted by sort_order.
    Cached for 5 minutes to reduce database load.
    """
    global _TIERS_CACHE, _TIERS_CACHE_AT
    now = time.monotonic()
    if _TIERS_CACHE is not None and (now - _TIERS_CACHE_AT) < _TIERS_TTL_SECONDS:
        return [_out(t) for t in _TIERS_CACHE]
    tiers = _get_tiers_uncached(db)
    _TIERS_CACHE = tiers
    _TIERS_CACHE_AT = now
    return [_out(t) for t in tiers]


@router.get("/tiers/{tier_name}", response_model=PricingTierResponse)
async def get_pricing_tier(tier_name: str, db: Session = Depends(get_db)):
    """
    Get a specific pricing tier by name (public endpoint).
    Uses the same cache as /tiers when possible.
    """
    from fastapi import HTTPException

    global _TIERS_CACHE, _TIERS_CACHE_AT
    now = time.monotonic()
    if _TIERS_CACHE is not None and (now - _TIERS_CACHE_AT) < _TIERS_TTL_SECONDS:
        for t in _TIERS_CACHE:
            if t.name == tier_name.lower():
                return _out(t)
        raise HTTPException(status_code=404, detail=f"Pricing tier '{tier_name}' not found")

    tier = db.query(PricingTier).filter(
        PricingTier.name == tier_name.lower(), PricingTier.is_active == True
    ).first()
    if not tier:
        raise HTTPException(status_code=404, detail=f"Pricing tier '{tier_name}' not found")
    # Warm the list cache for next time
    _TIERS_CACHE = _get_tiers_uncached(db)
    _TIERS_CACHE_AT = time.monotonic()
    return _out(tier)
