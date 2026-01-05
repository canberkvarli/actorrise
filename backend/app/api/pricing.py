"""
Pricing API endpoints (public).

Public endpoints for fetching pricing tier information.
No authentication required - used by marketing pages to display pricing.
"""

from typing import Any

from app.core.database import get_db
from app.models.billing import PricingTier
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


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


@router.get("/tiers", response_model=list[PricingTierResponse])
async def get_pricing_tiers(db: Session = Depends(get_db)):
    """
    Get all active pricing tiers (public endpoint).

    Returns a list of all active pricing tiers sorted by sort_order.
    Used by the pricing page to display available plans.

    No authentication required - this is a public endpoint.

    Returns:
        List of PricingTierResponse objects with pricing and feature details
    """
    tiers = db.query(PricingTier).filter(PricingTier.is_active == True).order_by(PricingTier.sort_order).all()

    return tiers


@router.get("/tiers/{tier_name}", response_model=PricingTierResponse)
async def get_pricing_tier(tier_name: str, db: Session = Depends(get_db)):
    """
    Get a specific pricing tier by name (public endpoint).

    Args:
        tier_name: Name of the tier (e.g., "free", "pro", "elite")

    Returns:
        PricingTierResponse object with pricing and feature details

    Raises:
        404: If tier not found
    """
    from fastapi import HTTPException

    tier = db.query(PricingTier).filter(
        PricingTier.name == tier_name.lower(), PricingTier.is_active == True
    ).first()

    if not tier:
        raise HTTPException(status_code=404, detail=f"Pricing tier '{tier_name}' not found")

    return tier
