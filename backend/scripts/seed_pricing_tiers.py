"""
Upsert pricing tiers into the database from the canonical definitions.

Tier limits live in ONE place: ``app.core.seed.canonical_tiers()``. This script
just pushes them to the DB (insert new, update existing, deactivate anything not
in the canonical set) so prod can never drift from code again.

Canonical tiers (Free / Solo / Plus / Pro):
- Free: $0/month (5 AI searches, 3 bookmarks, 1 trial)
- Solo: $7/month or $59/year (25 AI searches, 15 bookmarks, 3 scenes/mo)
- Plus: $12/month or $99/year (unlimited searches, unlimited bookmarks, 30 scenes/mo)
- Pro:  $24/month or $199/year (unlimited everything)

Run after creating the database schema:
    python backend/scripts/seed_pricing_tiers.py
"""

import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.core.seed import canonical_tiers
from app.models.billing import PricingTier
from sqlalchemy.exc import IntegrityError


def seed_pricing_tiers():
    """Upsert the canonical pricing tiers into the database."""
    db = SessionLocal()

    try:
        tiers = canonical_tiers()

        for tier in tiers:
            existing = db.query(PricingTier).filter(PricingTier.name == tier.name).first()

            if existing:
                existing.display_name = tier.display_name
                existing.description = tier.description
                existing.monthly_price_cents = tier.monthly_price_cents
                existing.annual_price_cents = tier.annual_price_cents
                existing.features = tier.features
                existing.sort_order = tier.sort_order
                existing.is_active = tier.is_active
                if tier.stripe_monthly_price_id:
                    existing.stripe_monthly_price_id = tier.stripe_monthly_price_id
                if tier.stripe_annual_price_id:
                    existing.stripe_annual_price_id = tier.stripe_annual_price_id
                print(f"Updated tier: {tier.display_name} (${tier.monthly_price_cents/100:.2f}/month)")
                continue

            db.add(tier)
            print(f"Created tier: {tier.display_name} (${tier.monthly_price_cents/100:.2f}/month)")

        # Deactivate any tiers not in the canonical list (keeps rows for billing history)
        active_names = {t.name for t in tiers}
        stale = db.query(PricingTier).filter(
            PricingTier.name.notin_(active_names),
            PricingTier.is_active == True,  # noqa: E712
        ).all()
        for old_tier in stale:
            old_tier.is_active = False
            print(f"Deactivated tier: {old_tier.display_name}")

        db.commit()
        print("\nPricing tiers seeded successfully!")

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
