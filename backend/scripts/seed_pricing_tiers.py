"""
Seed pricing tiers into the database.

This script populates the pricing_tiers table with four subscription plans:
- Free: $0/month (5 AI searches, 3 bookmarks, 1 trial)
- Solo: $7/month or $59/year (25 AI searches, 15 bookmarks, 3 scenes/mo)
- Plus: $12/month or $99/year (unlimited searches, unlimited bookmarks, 10 scenes/mo)
- Pro: $24/month or $199/year (unlimited everything)

Run this script after creating the database schema:
    python backend/scripts/seed_pricing_tiers.py

Note: Stripe price IDs should be updated after creating products in Stripe Dashboard.
"""

import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.billing import PricingTier
from sqlalchemy.exc import IntegrityError


def seed_pricing_tiers():
    """Seed the pricing tiers into the database."""
    db = SessionLocal()

    try:
        tiers = [
            # FREE TIER
            PricingTier(
                name="free",
                display_name="Free",
                description="Explore and try it out",
                monthly_price_cents=0,
                annual_price_cents=0,
                stripe_monthly_price_id=None,
                stripe_annual_price_id=None,
                features={
                    "ai_searches_per_month": 5,
                    "bookmarks_limit": 3,
                    "recommendations": True,
                    "download_formats": ["pdf", "docx"],
                    "priority_support": False,
                    "scene_partner_scripts": 0,
                    "scene_partner_sessions": 0,
                    "scene_partner_trial_only": True,
                },
                is_active=True,
                sort_order=0,
            ),
            # SOLO TIER
            PricingTier(
                name="solo",
                display_name="Solo",
                description="For actors getting started",
                monthly_price_cents=700,  # $7.00
                annual_price_cents=5900,  # $59.00 ($4.92/mo, ~30% savings)
                stripe_monthly_price_id=None,  # TODO: Add Stripe price ID
                stripe_annual_price_id=None,  # TODO: Add Stripe price ID
                features={
                    "ai_searches_per_month": 25,
                    "bookmarks_limit": 15,
                    "recommendations": True,
                    "download_formats": ["pdf", "docx"],
                    "priority_support": False,
                    "scene_partner_scripts": 1,
                    "scene_partner_sessions": 3,  # 3 unique scenes/month
                },
                is_active=True,
                sort_order=1,
            ),
            # PLUS TIER
            PricingTier(
                name="plus",
                display_name="Plus",
                description="For working actors and students",
                monthly_price_cents=1200,  # $12.00
                annual_price_cents=9900,  # $99.00 ($8.25/mo, 31% savings)
                stripe_monthly_price_id=None,  # TODO: Add Stripe price ID
                stripe_annual_price_id=None,  # TODO: Add Stripe price ID
                features={
                    "ai_searches_per_month": -1,  # unlimited
                    "bookmarks_limit": -1,  # unlimited
                    "recommendations": True,
                    "download_formats": ["pdf", "docx"],
                    "priority_support": False,
                    "scene_partner_scripts": 5,
                    "scene_partner_sessions": 10,  # 10 unique scenes/month
                },
                is_active=True,
                sort_order=2,
            ),
            # PRO TIER
            PricingTier(
                name="pro",
                display_name="Pro",
                description="For professionals and coaches",
                monthly_price_cents=2400,  # $24.00
                annual_price_cents=19900,  # $199.00 ($16.58/mo, 31% savings)
                stripe_monthly_price_id=None,  # TODO: Add Stripe price ID
                stripe_annual_price_id=None,  # TODO: Add Stripe price ID
                features={
                    "ai_searches_per_month": -1,  # unlimited
                    "bookmarks_limit": -1,  # unlimited
                    "recommendations": True,
                    "download_formats": ["pdf", "docx"],
                    "priority_support": False,
                    "scene_partner_scripts": -1,  # unlimited
                    "scene_partner_sessions": -1,  # unlimited scenes
                },
                is_active=True,
                sort_order=3,
            ),
        ]

        for tier in tiers:
            existing = db.query(PricingTier).filter(PricingTier.name == tier.name).first()

            if existing:
                # Update existing tier
                existing.display_name = tier.display_name
                existing.description = tier.description
                existing.monthly_price_cents = tier.monthly_price_cents
                existing.annual_price_cents = tier.annual_price_cents
                existing.features = tier.features
                existing.sort_order = tier.sort_order
                existing.is_active = tier.is_active
                print(f"Updated tier: {tier.display_name} (${tier.monthly_price_cents/100:.2f}/month)")
                continue

            db.add(tier)
            print(f"Created tier: {tier.display_name} (${tier.monthly_price_cents/100:.2f}/month)")

        db.commit()
        print("\nPricing tiers seeded successfully!")
        print("\nNext steps:")
        print("1. Create products in Stripe Dashboard:")
        print("   - Solo: $7/month and $59/year")
        print("   - Plus: $12/month and $99/year")
        print("   - Pro: $24/month and $199/year")
        print("2. Copy the Stripe price IDs (price_xxxxx)")
        print("3. Update the database with the Stripe price IDs")

    except IntegrityError as e:
        db.rollback()
        print(f"Error seeding pricing tiers: {e}")

    except Exception as e:
        db.rollback()
        print(f"Unexpected error: {e}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding pricing tiers...")
    seed_pricing_tiers()
