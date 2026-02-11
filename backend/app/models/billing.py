"""
Billing and subscription models for ActorRise monetization system.

This module contains models for:
- PricingTier: Subscription plan definitions (Free, Pro, Elite)
- UserSubscription: User's current subscription status and billing info
- UsageMetrics: Track usage for rate limiting and analytics
- BillingHistory: Payment and invoice history
"""

from datetime import date, datetime

from app.core.database import Base
from sqlalchemy import (Boolean, Column, Date, DateTime, ForeignKey, Index,
                        Integer, String)
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSON, JSONB
from sqlalchemy.orm import relationship


class PricingTier(Base):
    """
    Pricing tier definitions (seeded data, not user-editable).

    Defines available subscription plans (Free, Pro, Elite) with pricing,
    Stripe integration, and feature limits stored as JSON for flexibility.

    Example features JSON:
    {
        "ai_searches_per_month": 150,  # -1 = unlimited
        "bookmarks_limit": -1,  # -1 = unlimited
        "recommendations": true,
        "scene_partner_sessions": 10,
        "craft_coach_sessions": 5,
        "download_formats": ["txt", "pdf"],
        "priority_support": true,
        "advanced_analytics": false
    }
    """

    __tablename__ = "pricing_tiers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)  # "free", "pro", "elite"
    display_name = Column(String, nullable=False)  # "Pro", "Elite"
    description = Column(String, nullable=True)  # Short tagline for the tier

    # Pricing in cents (USD)
    monthly_price_cents = Column(Integer, nullable=False)  # $12.00 = 1200
    annual_price_cents = Column(Integer, nullable=True)  # $99.00 = 9900

    # Stripe Integration
    stripe_monthly_price_id = Column(String, nullable=True)  # price_xxxxx from Stripe
    stripe_annual_price_id = Column(String, nullable=True)  # price_yyyyy from Stripe

    # Feature Limits (JSON for flexibility - easy to add new features)
    features = Column(JSONB, nullable=False, default={})

    # Admin fields
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)  # For display ordering (0 = first)

    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text("now()"))

    def __repr__(self):
        return f"<PricingTier {self.display_name} (${self.monthly_price_cents/100:.2f}/mo)>"


class UserSubscription(Base):
    """
    User's subscription status and billing information.

    Tracks the user's current pricing tier, Stripe subscription details,
    billing period (monthly/annual), and subscription lifecycle (active, canceled, etc.).

    One-to-one relationship with User model.
    """

    __tablename__ = "user_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    tier_id = Column(Integer, ForeignKey("pricing_tiers.id"), nullable=False, index=True)

    # Subscription status
    # Status values: "active", "trialing", "canceled", "past_due", "unpaid", "incomplete"
    status = Column(String, nullable=False, default="active", index=True)

    # Billing period: "monthly" or "annual"
    billing_period = Column(String, nullable=False, default="monthly")

    # Stripe Integration
    stripe_customer_id = Column(String, nullable=True, unique=True, index=True)
    stripe_subscription_id = Column(String, nullable=True, unique=True, index=True)
    stripe_payment_method_id = Column(String, nullable=True)

    # Subscription lifecycle
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True, index=True)
    cancel_at_period_end = Column(Boolean, default=False)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    trial_end = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))
    updated_at = Column(DateTime(timezone=True), onupdate=sql_text("now()"))

    # Relationships
    user = relationship("User", back_populates="subscription")
    tier = relationship("PricingTier")

    def __repr__(self):
        return f"<UserSubscription user_id={self.user_id} tier_id={self.tier_id} status={self.status}>"

    @property
    def is_active(self) -> bool:
        """Check if subscription is currently active."""
        return self.status in ["active", "trialing"]

    @property
    def is_paid_tier(self) -> bool:
        """Check if user is on a paid tier (not free)."""
        # Assumes tier_id=1 is free tier (update based on your seeding)
        return self.tier_id > 1

    @property
    def days_until_renewal(self) -> int | None:
        """Calculate days until next renewal (or None if no renewal date)."""
        if not self.current_period_end:
            return None
        delta = self.current_period_end.date() - date.today()
        return max(0, delta.days)


class UsageMetrics(Base):
    """
    Track usage for rate limiting and analytics.

    Records daily usage counters for features with limits (AI searches,
    ScenePartner sessions, CraftCoach sessions). Used for enforcing tier
    limits and displaying usage stats to users.

    Designed for efficient monthly queries with composite index on (user_id, date).
    """

    __tablename__ = "usage_metrics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Date-based tracking (one row per user per day)
    date = Column(Date, nullable=False, index=True)

    # Usage counters (incremented throughout the day)
    ai_searches_count = Column(Integer, default=0, nullable=False)
    scene_partner_sessions = Column(Integer, default=0, nullable=False)
    craft_coach_sessions = Column(Integer, default=0, nullable=False)

    # Composite index for efficient monthly queries
    __table_args__ = (
        Index("ix_usage_user_date", "user_id", "date"),
        # Unique constraint to prevent duplicate daily records
        Index("uq_usage_user_date", "user_id", "date", unique=True),
    )

    def __repr__(self):
        return f"<UsageMetrics user_id={self.user_id} date={self.date} searches={self.ai_searches_count}>"


class BillingHistory(Base):
    """
    Payment and billing event history.

    Records all payment transactions, invoices, and billing events from Stripe.
    Used for displaying billing history to users and financial reporting.
    """

    __tablename__ = "billing_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Transaction details
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String, default="usd", nullable=False)
    status = Column(String, nullable=False)  # "succeeded", "failed", "refunded", "pending"
    description = Column(String, nullable=True)  # Human-readable description

    # Stripe Integration
    stripe_invoice_id = Column(String, nullable=True, unique=True, index=True)
    stripe_payment_intent_id = Column(String, nullable=True)
    stripe_charge_id = Column(String, nullable=True)

    # Invoice details
    invoice_url = Column(String, nullable=True)  # Stripe hosted invoice URL
    invoice_pdf_url = Column(String, nullable=True)  # Direct PDF download

    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    # Relationships
    user = relationship("User")

    def __repr__(self):
        return f"<BillingHistory user_id={self.user_id} amount=${self.amount_cents/100:.2f} status={self.status}>"

    @property
    def amount_dollars(self) -> float:
        """Get amount in dollars (for display)."""
        return self.amount_cents / 100.0
