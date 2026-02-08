"""
Ensure required seed data exists at startup (e.g. pricing tiers).
Runs once when the API starts so Render/production DB has tiers without a manual seed run.
"""

from app.core.database import SessionLocal
from app.models.billing import PricingTier


def ensure_pricing_tiers() -> None:
    """If pricing_tiers table is empty, insert Free, Plus, Unlimited. Idempotent."""
    db = SessionLocal()
    try:
        if db.query(PricingTier).first() is not None:
            return
        tiers = [
            PricingTier(
                name="free",
                display_name="Free",
                description="Perfect for exploring ActorRise",
                monthly_price_cents=0,
                annual_price_cents=0,
                stripe_monthly_price_id=None,
                stripe_annual_price_id=None,
                features={
                    "ai_searches_per_month": 10,
                    "bookmarks_limit": 5,
                    "recommendations": False,
                    "download_formats": ["txt"],
                    "priority_support": False,
                    "search_history_limit": 5,
                    "advanced_analytics": False,
                },
                is_active=True,
                sort_order=0,
            ),
            PricingTier(
                name="plus",
                display_name="Plus",
                description="For actors",
                monthly_price_cents=1200,
                annual_price_cents=9900,
                stripe_monthly_price_id=None,
                stripe_annual_price_id=None,
                features={
                    "ai_searches_per_month": 150,
                    "bookmarks_limit": -1,
                    "recommendations": True,
                    "download_formats": ["txt", "pdf"],
                    "priority_support": True,
                    "search_history_limit": -1,
                    "advanced_analytics": False,
                    "early_access": True,
                },
                is_active=True,
                sort_order=1,
            ),
            PricingTier(
                name="unlimited",
                display_name="Unlimited",
                description="For professionals and coaches",
                monthly_price_cents=2400,
                annual_price_cents=19900,
                stripe_monthly_price_id=None,
                stripe_annual_price_id=None,
                features={
                    "ai_searches_per_month": -1,
                    "bookmarks_limit": -1,
                    "recommendations": True,
                    "scene_partner_sessions": 10,
                    "craft_coach_sessions": 5,
                    "download_formats": ["txt", "pdf"],
                    "priority_support": True,
                    "search_history_limit": -1,
                    "advanced_analytics": True,
                    "collections": True,
                    "collaboration": True,
                    "white_label_export": True,
                    "early_access": True,
                },
                is_active=True,
                sort_order=2,
            ),
        ]
        for t in tiers:
            db.add(t)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
