"""
Seed pricing tiers into the database.

This script populates the pricing_tiers table with the three subscription plans:
- Free: $0/month (10 AI searches, 5 bookmarks)
- Pro: $12/month or $99/year (150 AI searches, unlimited bookmarks)
- Elite: $24/month or $199/year (unlimited searches + future AI features)

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
        # Define the three pricing tiers
        tiers = [
            # FREE TIER
            PricingTier(
                name="free",
                display_name="Free",
                description="Perfect for exploring ActorRise",
                monthly_price_cents=0,
                annual_price_cents=0,
                stripe_monthly_price_id=None,  # No Stripe price for free tier
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
            # PRO TIER
            PricingTier(
                name="pro",
                display_name="Pro",
                description="For working actors and students",
                monthly_price_cents=1200,  # $12.00
                annual_price_cents=9900,  # $99.00 ($8.25/mo, 31% discount)
                stripe_monthly_price_id=None,  # TODO: Replace with actual Stripe price ID
                stripe_annual_price_id=None,  # TODO: Replace with actual Stripe price ID
                features={
                    "ai_searches_per_month": 150,
                    "bookmarks_limit": -1,  # -1 = unlimited
                    "recommendations": True,
                    "download_formats": ["txt", "pdf"],
                    "priority_support": True,
                    "search_history_limit": -1,  # -1 = unlimited
                    "advanced_analytics": False,
                    "early_access": True,  # Beta access to new features
                },
                is_active=True,
                sort_order=1,
            ),
            # ELITE TIER
            PricingTier(
                name="elite",
                display_name="Elite",
                description="For professionals and coaches",
                monthly_price_cents=2400,  # $24.00
                annual_price_cents=19900,  # $199.00 ($16.58/mo, 31% discount)
                stripe_monthly_price_id=None,  # TODO: Replace with actual Stripe price ID
                stripe_annual_price_id=None,  # TODO: Replace with actual Stripe price ID
                features={
                    "ai_searches_per_month": -1,  # -1 = unlimited
                    "bookmarks_limit": -1,  # -1 = unlimited
                    "recommendations": True,
                    "scene_partner_sessions": 10,  # Future feature
                    "craft_coach_sessions": 5,  # Future feature
                    "download_formats": ["txt", "pdf"],
                    "priority_support": True,
                    "search_history_limit": -1,  # -1 = unlimited
                    "advanced_analytics": True,
                    "collections": True,  # Organize monologues into custom sets
                    "collaboration": True,  # Share collections with others
                    "white_label_export": True,  # Remove ActorRise branding from downloads
                    "early_access": True,
                },
                is_active=True,
                sort_order=2,
            ),
        ]

        # Insert tiers into database
        for tier in tiers:
            # Check if tier already exists
            existing = db.query(PricingTier).filter(PricingTier.name == tier.name).first()

            if existing:
                print(f"⚠️  Tier '{tier.display_name}' already exists. Skipping...")
                continue

            db.add(tier)
            print(f"✅ Created tier: {tier.display_name} (${tier.monthly_price_cents/100:.2f}/month)")

        db.commit()
        print("\n🎉 Pricing tiers seeded successfully!")
        print("\n📝 Next steps:")
        print("1. Create products in Stripe Dashboard:")
        print("   - Pro: $12/month and $99/year")
        print("   - Elite: $24/month and $199/year")
        print("2. Copy the Stripe price IDs (price_xxxxx)")
        print("3. Update the database with SQL:")
        print("   UPDATE pricing_tiers SET")
        print("     stripe_monthly_price_id = 'price_xxxxx',")
        print("     stripe_annual_price_id = 'price_yyyyy'")
        print("   WHERE name = 'pro';")

    except IntegrityError as e:
        db.rollback()
        print(f"❌ Error seeding pricing tiers: {e}")
        print("This usually means the tiers already exist in the database.")

    except Exception as e:
        db.rollback()
        print(f"❌ Unexpected error: {e}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    print("🌱 Seeding pricing tiers...")
    seed_pricing_tiers()
