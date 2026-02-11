"""
Update Stripe price IDs for Plus and Unlimited tiers.

Reads price IDs from environment variables (or .env) and updates pricing_tiers.

Required env vars:
  STRIPE_PRICE_PLUS_MONTHLY      e.g. price_xxxxx
  STRIPE_PRICE_PLUS_ANNUAL       e.g. price_yyyyy
  STRIPE_PRICE_UNLIMITED_MONTHLY e.g. price_aaaaa
  STRIPE_PRICE_UNLIMITED_ANNUAL  e.g. price_bbbbb

Run from repo root or backend dir:
  cd backend && uv run python scripts/update_stripe_price_ids.py

Or with inline env:
  STRIPE_PRICE_PLUS_MONTHLY=price_xxx STRIPE_PRICE_PLUS_ANNUAL=price_yyy \\
  STRIPE_PRICE_UNLIMITED_MONTHLY=price_aaa STRIPE_PRICE_UNLIMITED_ANNUAL=price_bbb \\
  uv run python scripts/update_stripe_price_ids.py
"""

import os
import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load .env if present (backend/.env or cwd)
try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

from app.core.database import SessionLocal
from app.models.billing import PricingTier


def main():
    plus_monthly = os.getenv("STRIPE_PRICE_PLUS_MONTHLY", "").strip()
    plus_annual = os.getenv("STRIPE_PRICE_PLUS_ANNUAL", "").strip()
    unlimited_monthly = os.getenv("STRIPE_PRICE_UNLIMITED_MONTHLY", "").strip()
    unlimited_annual = os.getenv("STRIPE_PRICE_UNLIMITED_ANNUAL", "").strip()

    missing = []
    if not plus_monthly:
        missing.append("STRIPE_PRICE_PLUS_MONTHLY")
    if not plus_annual:
        missing.append("STRIPE_PRICE_PLUS_ANNUAL")
    if not unlimited_monthly:
        missing.append("STRIPE_PRICE_UNLIMITED_MONTHLY")
    if not unlimited_annual:
        missing.append("STRIPE_PRICE_UNLIMITED_ANNUAL")

    if missing:
        print("Missing environment variables:", ", ".join(missing))
        print("Add them to backend/.env or pass them when running this script.")
        sys.exit(1)

    db = SessionLocal()
    try:
        plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
        unlimited = db.query(PricingTier).filter(PricingTier.name == "unlimited").first()

        if not plus:
            print("No 'plus' tier found in pricing_tiers. Run seed first.")
            sys.exit(1)
        if not unlimited:
            print("No 'unlimited' tier found in pricing_tiers. Run seed first.")
            sys.exit(1)

        plus.stripe_monthly_price_id = plus_monthly
        plus.stripe_annual_price_id = plus_annual
        unlimited.stripe_monthly_price_id = unlimited_monthly
        unlimited.stripe_annual_price_id = unlimited_annual

        db.commit()
        print("Updated Stripe price IDs:")
        print("  plus:     monthly", plus_monthly, "annual", plus_annual)
        print("  unlimited: monthly", unlimited_monthly, "annual", unlimited_annual)
    except Exception as e:
        db.rollback()
        print("Error:", e)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
