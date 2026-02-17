"""
Quick check: are Stripe price IDs set in the database for Plus and Unlimited?

Run from repo root or backend dir:
  cd backend && uv run python scripts/check_stripe_config.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

try:
    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env")
    load_dotenv()
except ImportError:
    pass

from app.core.database import SessionLocal
from app.models.billing import PricingTier


def main():
    db = SessionLocal()
    try:
        for name in ("plus", "unlimited"):
            tier = db.query(PricingTier).filter(PricingTier.name == name).first()
            if not tier:
                print(f"  {name}: tier not found in DB")
                continue
            monthly = "ok" if tier.stripe_monthly_price_id else "MISSING"
            annual = "ok" if tier.stripe_annual_price_id else "MISSING"
            print(f"  {name}: monthly={monthly}, annual={annual}")
        print()
        plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
        if plus and plus.stripe_monthly_price_id and plus.stripe_annual_price_id:
            print("Stripe price IDs are set. Checkout should work.")
        else:
            print("Some Stripe price IDs are missing. Add STRIPE_PRICE_* to backend/.env")
            print("then run: uv run python scripts/update_stripe_price_ids.py")
    finally:
        db.close()


if __name__ == "__main__":
    main()
