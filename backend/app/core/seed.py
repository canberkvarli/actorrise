"""
Canonical pricing tier definitions + idempotent startup seeding.

This module is the SINGLE SOURCE OF TRUTH for tier feature limits. Both the
startup seeder (``ensure_pricing_tiers``) and the manual upsert script
(``scripts/seed_pricing_tiers.py``) build their tiers from ``canonical_tiers()``
so the two can never drift apart again.

History: ScenePartner caps drifted in prod because two seed files defined
different Plus limits (10 vs 30). Plus is 30 sessions/month. Keep it here only.
"""

from app.core.database import SessionLocal
from app.models.billing import PricingTier


def canonical_tiers() -> list[PricingTier]:
    """Return the canonical Free / Solo / Plus / Pro tier set.

    The ``features`` dicts here are authoritative. ``-1`` means unlimited,
    ``0`` means not available. Update limits HERE, then run
    ``python backend/scripts/seed_pricing_tiers.py`` to push to the DB.
    """
    return [
        # FREE
        PricingTier(
            name="free",
            display_name="Free",
            description="Explore and try it out",
            monthly_price_cents=0,
            annual_price_cents=0,
            stripe_monthly_price_id=None,
            stripe_annual_price_id=None,
            features={
                "ai_searches_per_month": 10,
                "bookmarks_limit": 10,
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 0,
                "scene_partner_sessions": 2,
                "monologue_sessions": 2,  # free = 2 rehearsals (no-card taste), then paywall -> card-on-file Plus trial. Paid tiers stay -1.
                "scene_partner_trial_only": True,
            },
            is_active=True,
            sort_order=0,
        ),
        # SOLO — $7/mo
        PricingTier(
            name="solo",
            display_name="Solo",
            description="For actors getting started",
            monthly_price_cents=700,
            annual_price_cents=5900,
            stripe_monthly_price_id="price_1TB9sHRg9rz1StUqgZ4y46hb",
            stripe_annual_price_id="price_1TB9uJRg9rz1StUqRQMbqKz2",
            features={
                "ai_searches_per_month": 25,
                "bookmarks_limit": 15,
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 1,
                "scene_partner_sessions": 3,  # 3 unique scenes/month
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=True,
            sort_order=1,
        ),
        # PLUS — $12/mo
        PricingTier(
            name="plus",
            display_name="Plus",
            description="For working actors and students",
            monthly_price_cents=1200,
            annual_price_cents=9900,
            stripe_monthly_price_id="price_1SyWoMRg9rz1StUqUqj3ltC1",
            stripe_annual_price_id="price_1SyWpsRg9rz1StUqRVhstl9N",
            features={
                "ai_searches_per_month": -1,  # unlimited
                "bookmarks_limit": -1,  # unlimited
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 5,
                "scene_partner_sessions": 30,  # 30 unique scenes/month
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=True,
            sort_order=2,
        ),
        # PRO — $24/mo
        PricingTier(
            name="pro",
            display_name="Pro",
            description="For professionals and coaches",
            monthly_price_cents=2400,
            annual_price_cents=19900,
            stripe_monthly_price_id="price_1TBA1XRg9rz1StUqlOP5Ox4O",
            stripe_annual_price_id="price_1TBA1zRg9rz1StUqI8dDx47x",
            features={
                "ai_searches_per_month": -1,  # unlimited
                "bookmarks_limit": -1,  # unlimited
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": -1,  # unlimited
                "scene_partner_sessions": -1,  # unlimited scenes
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=True,
            sort_order=3,
        ),
    ]


def ensure_pricing_tiers() -> None:
    """If the pricing_tiers table is empty, insert the canonical tiers.

    Idempotent: does nothing once tiers exist (it will not overwrite live
    rows). To push canonical changes to an already-seeded DB, run
    ``scripts/seed_pricing_tiers.py`` which upserts.
    """
    db = SessionLocal()
    try:
        if db.query(PricingTier).first() is not None:
            return
        for tier in canonical_tiers():
            db.add(tier)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
