"""
Subscription management API endpoints (protected).

Endpoints for managing user subscriptions, creating Stripe checkout sessions,
viewing usage metrics, and accessing billing history.

All endpoints require authentication.
"""

import os
from datetime import date, datetime
from typing import Any

import stripe
from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.billing import (
    BillingHistory,
    PricingTier,
    UsageMetrics,
    UserSubscription,
)
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])

# Configure Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Educational email domain suffixes (lowercase) — used for auto student 50% discount
SCHOOL_EMAIL_SUFFIXES = (
    ".edu", ".ac.uk", ".edu.au", ".ac.nz", ".edu.sg", ".ac.in", ".edu.in",
    ".edu.tr", ".ac.jp", ".edu.mx", ".edu.br", ".ac.za", ".ac.kr", ".edu.ph",
    ".edu.my", ".edu.pk", ".edu.cn", ".edu.tw", ".edu.hk", ".edu.sa", ".edu.eg",
    ".edu.nz", ".ac.th", ".edu.vn", ".edu.id", ".ac.be", ".edu.ar", ".edu.co",
    ".edu.ng", ".edu.gh", ".ac.ug", ".edu.et", ".ac.ke",
)


def _is_school_email(email: str | None) -> bool:
    """True if email is from a known educational domain (e.g. .edu, .ac.uk)."""
    if not email or "@" not in email:
        return False
    domain = email.strip().lower().split("@")[-1]
    return any(domain.endswith(s) for s in SCHOOL_EMAIL_SUFFIXES)


# ============================================================================
# Request/Response Models
# ============================================================================


class SubscriptionResponse(BaseModel):
    """Response model for user subscription details."""

    tier_name: str
    tier_display_name: str
    status: str
    billing_period: str
    current_period_end: datetime | None
    cancel_at_period_end: bool

    class Config:
        from_attributes = True


class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a Stripe checkout session."""

    tier_id: int
    billing_period: str  # "monthly" or "annual"
    success_url: str
    cancel_url: str
    promo_code: str | None = None  # e.g. "FOUNDER" for founding user discount


class CreateCheckoutSessionResponse(BaseModel):
    """Response with Stripe checkout URL."""

    checkout_url: str


class CreatePortalSessionResponse(BaseModel):
    """Response with Stripe Customer Portal URL."""

    portal_url: str


class StudentDiscountEligibleResponse(BaseModel):
    """Whether the current user's email qualifies for auto student 50% discount."""

    eligible: bool


class UsageLimitsResponse(BaseModel):
    """Response with current usage and limits."""

    ai_searches_used: int
    ai_searches_limit: int
    scene_partner_used: int
    scene_partner_limit: int
    craft_coach_used: int
    craft_coach_limit: int


class BillingHistoryItem(BaseModel):
    """Individual billing history record."""

    id: int
    amount_cents: int
    currency: str
    status: str
    description: str | None
    invoice_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/me", response_model=SubscriptionResponse)
async def get_my_subscription(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get current user's subscription details.

    Returns subscription tier, status, billing period, and renewal date.
    Defaults to Free tier if no subscription exists.

    Requires authentication.
    """
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == current_user.id).first()

    if not subscription:
        # Return Free tier by default (even if DB not seeded yet)
        free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
        return SubscriptionResponse(
            tier_name="free",
            tier_display_name=free_tier.display_name if free_tier else "Free",
            status="active",
            billing_period="monthly",
            current_period_end=None,
            cancel_at_period_end=False,
        )

    tier = db.query(PricingTier).get(subscription.tier_id)
    if not tier:
        # Fallback to free if tier missing (e.g. tier deleted)
        return SubscriptionResponse(
            tier_name="free",
            tier_display_name="Free",
            status=subscription.status,
            billing_period=subscription.billing_period or "monthly",
            current_period_end=subscription.current_period_end,
            cancel_at_period_end=subscription.cancel_at_period_end or False,
        )

    return SubscriptionResponse(
        tier_name=tier.name,
        tier_display_name=tier.display_name,
        status=subscription.status,
        billing_period=subscription.billing_period,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
    )


@router.get("/student-discount-eligible", response_model=StudentDiscountEligibleResponse)
async def student_discount_eligible(current_user: User = Depends(get_current_user)):
    """
    Whether the current user gets the student 50% discount automatically (school email).

    If true, checkout will apply the discount without entering a promo code.
    """
    eligible = _is_school_email(current_user.email) and bool(os.getenv("STRIPE_STUDENT_50_COUPON_ID"))
    return StudentDiscountEligibleResponse(eligible=eligible)


@router.post("/create-checkout-session", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a Stripe Checkout session for subscription.

    Args:
        tier_id: ID of the pricing tier to subscribe to
        billing_period: "monthly" or "annual"
        success_url: URL to redirect to after successful payment
        cancel_url: URL to redirect to if user cancels

    Returns:
        checkout_url: Stripe Checkout URL to redirect user to

    Raises:
        404: If pricing tier not found
        400: If invalid billing period
    """
    # Validate tier exists
    tier = db.query(PricingTier).get(request.tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Pricing tier not found")

    # Validate billing period
    if request.billing_period not in ["monthly", "annual"]:
        raise HTTPException(status_code=400, detail="billing_period must be 'monthly' or 'annual'")

    # Get or create Stripe customer
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == current_user.id).first()

    if subscription and subscription.stripe_customer_id:
        customer_id = subscription.stripe_customer_id
    else:
        # Create new Stripe customer
        customer = stripe.Customer.create(email=current_user.email, metadata={"user_id": current_user.id})
        customer_id = customer.id

    # Get Stripe price ID
    if request.billing_period == "annual":
        price_id = tier.stripe_annual_price_id
    else:
        price_id = tier.stripe_monthly_price_id

    if not price_id:
        raise HTTPException(
            status_code=400,
            detail=f"Stripe price ID not configured for {tier.display_name} {request.billing_period} plan",
        )

    # Resolve promo code to Stripe coupon (e.g. FOUNDER -> 100% off for 1 year)
    discounts = []
    if request.promo_code:
        promo = request.promo_code.strip().upper()
        if promo == "FOUNDER":
            founder_coupon_id = os.getenv("STRIPE_FOUNDER_COUPON_ID")
            if founder_coupon_id:
                discounts = [{"coupon": founder_coupon_id}]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Promo code FOUNDER is not configured. Please contact support.",
                )
        elif promo in ("STARTUPS", "STARTUPS24"):
            startups_coupon_id = os.getenv("STRIPE_STARTUPS_COUPON_ID")
            if startups_coupon_id:
                discounts = [{"coupon": startups_coupon_id}]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Promo code is not configured. Please contact support.",
                )
        elif promo in ("BUSINESS", "ACTINGTEACHER26"):
            # 100% off for 3 months — teachers/coaches (Render: ACTINGTEACHER26=coupon_id)
            business_coupon_id = os.getenv("STRIPE_BUSINESS_COUPON_ID") or os.getenv("ACTINGTEACHER26")
            if business_coupon_id:
                discounts = [{"coupon": business_coupon_id}]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Promo code is not configured. Please contact support.",
                )
        elif promo in ("STUDENT", "STUDENTACTOR26"):
            # 100% off for 6 months — students (Render: STUDENTACTOR26=coupon_id)
            student_coupon_id = os.getenv("STRIPE_STUDENT_COUPON_ID") or os.getenv("STUDENTACTOR26")
            if student_coupon_id:
                discounts = [{"coupon": student_coupon_id}]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Promo code is not configured. Please contact support.",
                )
        elif promo in ("STXQ5NU4", "STUDENT50"):
            # 50% off — Student discount (promo code StxQ5Nu4, name: Student discount)
            student_50_coupon_id = os.getenv("STRIPE_STUDENT_50_COUPON_ID")
            if student_50_coupon_id:
                discounts = [{"coupon": student_50_coupon_id}]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Student discount is not configured. Please contact support.",
                )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid promo code: {request.promo_code}")

    # No auto-apply: student/teacher discounts are manual review only (you send codes after approval).

    # Create checkout session
    create_params: dict[str, Any] = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [
            {
                "price": price_id,
                "quantity": 1,
            }
        ],
        "mode": "subscription",
        "success_url": request.success_url,
        "cancel_url": request.cancel_url,
        "metadata": {
            "user_id": current_user.id,
            "tier_id": tier.id,
            "billing_period": request.billing_period,
        },
    }
    if discounts:
        create_params["discounts"] = discounts

    try:
        checkout_session = stripe.checkout.Session.create(**create_params)

        return CreateCheckoutSessionResponse(checkout_url=checkout_session.url)

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.post("/create-portal-session", response_model=CreatePortalSessionResponse)
async def create_portal_session(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Create a Stripe Customer Portal session for managing subscription.

    Allows users to:
    - Update payment method
    - Switch between monthly/annual billing
    - Upgrade/downgrade tier
    - Cancel subscription

    Returns:
        portal_url: Stripe Customer Portal URL to redirect user to

    Raises:
        400: If no active subscription found
    """
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == current_user.id).first()

    if not subscription or not subscription.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found")

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000") + "/billing",
        )

        return CreatePortalSessionResponse(portal_url=portal_session.url)

    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.get("/usage", response_model=UsageLimitsResponse)
async def get_usage_limits(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get current usage and limits for the user.

    Returns usage for the current month (resets on 1st of each month):
    - AI searches used/limit
    - ScenePartner sessions used/limit
    - CraftCoach sessions used/limit

    Limits are pulled from the user's tier features JSON.
    -1 indicates unlimited usage.

    Requires authentication.
    """
    # Get user's subscription and tier
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == current_user.id).first()

    if subscription and subscription.tier_id:
        tier = db.query(PricingTier).get(subscription.tier_id)
    else:
        # Default to Free tier
        tier = db.query(PricingTier).filter(PricingTier.name == "free").first()

    if not tier:
        raise HTTPException(status_code=500, detail="Pricing tier not found")

    # Get current month's usage
    today = date.today()
    first_day = today.replace(day=1)

    usage_records = (
        db.query(UsageMetrics)
        .filter(UsageMetrics.user_id == current_user.id, UsageMetrics.date >= first_day)
        .all()
    )

    # Sum up usage for the month (guard against None from DB)
    ai_searches_used = sum((u.ai_searches_count or 0) for u in usage_records)
    scene_partner_used = sum((u.scene_partner_sessions or 0) for u in usage_records)
    craft_coach_used = sum((u.craft_coach_sessions or 0) for u in usage_records)

    # Get limits from tier features
    features = tier.features
    ai_searches_limit = features.get("ai_searches_per_month", 0)
    scene_partner_limit = features.get("scene_partner_sessions", 0)
    craft_coach_limit = features.get("craft_coach_sessions", 0)

    return UsageLimitsResponse(
        ai_searches_used=ai_searches_used,
        ai_searches_limit=ai_searches_limit,
        scene_partner_used=scene_partner_used,
        scene_partner_limit=scene_partner_limit,
        craft_coach_used=craft_coach_used,
        craft_coach_limit=craft_coach_limit,
    )


@router.get("/billing-history", response_model=list[BillingHistoryItem])
async def get_billing_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get user's billing history.

    Returns the last 12 billing transactions (payments, refunds, etc.)
    with invoice URLs for downloading receipts.

    Requires authentication.
    """
    history = (
        db.query(BillingHistory)
        .filter(BillingHistory.user_id == current_user.id)
        .order_by(BillingHistory.created_at.desc())
        .limit(12)
        .all()
    )

    return history
