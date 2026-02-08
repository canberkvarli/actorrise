"""
Wipe all users except the given superuser email and set that user to the unlimited tier.

Usage:
    From repo root:
        cd backend && uv run python scripts/wipe_users_make_superuser.py

    Or with custom email:
        SUPERUSER_EMAIL=you@example.com cd backend && uv run python scripts/wipe_users_make_superuser.py

The superuser email defaults to canberkvarli@gmail.com.
If that user does not exist in the DB yet, log in once with that email so the user is created, then run this script again.
"""

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.user import User
from app.models.billing import PricingTier, UserSubscription, UsageMetrics, BillingHistory
from app.models.actor import (
    ActorProfile,
    MonologueFavorite,
    RehearsalSession,
    RehearsalLineDelivery,
    SceneFavorite,
    UserScript,
    SearchHistory,
    Scene,
)

SUPERUSER_EMAIL = os.getenv("SUPERUSER_EMAIL", "canberkvarli@gmail.com").strip().lower()


def wipe_other_users_and_set_superuser(db: Session) -> None:
    superuser = db.query(User).filter(User.email.ilike(SUPERUSER_EMAIL)).first()
    all_users = db.query(User).all()
    other_users = [u for u in all_users if u.email and u.email.lower() != SUPERUSER_EMAIL]

    if not other_users:
        print("No other users to wipe.")
    else:
        print(f"Wiping {len(other_users)} user(s) other than {SUPERUSER_EMAIL}...")
        for u in other_users:
            uid = u.id
            # Rehearsal: delete line deliveries for this user's sessions, then sessions
            sessions = db.query(RehearsalSession).filter(RehearsalSession.user_id == uid).all()
            session_ids = [s.id for s in sessions]
            if session_ids:
                db.query(RehearsalLineDelivery).filter(RehearsalLineDelivery.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(RehearsalSession).filter(RehearsalSession.user_id == uid).delete(synchronize_session=False)
            # Scene favorites, monologue favorites
            db.query(SceneFavorite).filter(SceneFavorite.user_id == uid).delete(synchronize_session=False)
            db.query(MonologueFavorite).filter(MonologueFavorite.user_id == uid).delete(synchronize_session=False)
            # UserScript: unlink scenes that reference these scripts, then delete scripts
            scripts = db.query(UserScript).filter(UserScript.user_id == uid).all()
            user_script_ids = [s.id for s in scripts]
            if user_script_ids:
                db.query(Scene).filter(Scene.user_script_id.in_(user_script_ids)).update({Scene.user_script_id: None}, synchronize_session=False)
            db.query(UserScript).filter(UserScript.user_id == uid).delete(synchronize_session=False)
            # Search history
            db.query(SearchHistory).filter(SearchHistory.user_id == uid).delete(synchronize_session=False)
            # Actor profile, usage, billing, subscription
            db.query(ActorProfile).filter(ActorProfile.user_id == uid).delete(synchronize_session=False)
            db.query(UsageMetrics).filter(UsageMetrics.user_id == uid).delete(synchronize_session=False)
            db.query(BillingHistory).filter(BillingHistory.user_id == uid).delete(synchronize_session=False)
            db.query(UserSubscription).filter(UserSubscription.user_id == uid).delete(synchronize_session=False)
            db.query(User).filter(User.id == uid).delete(synchronize_session=False)
        db.commit()
        print("Done wiping other users.")

    if not superuser:
        print(f"\nUser '{SUPERUSER_EMAIL}' not found in the database.")
        print("Log in once with that email so the user is created, then run this script again.")
        return

    # Set superuser to unlimited tier
    unlimited = db.query(PricingTier).filter(PricingTier.name == "unlimited").first()
    if not unlimited:
        print("Unlimited pricing tier not found. Run: uv run python scripts/seed_pricing_tiers.py")
        return

    sub = db.query(UserSubscription).filter(UserSubscription.user_id == superuser.id).first()
    if sub:
        sub.tier_id = unlimited.id
        sub.status = "active"
        db.commit()
        print(f"Updated existing subscription for {SUPERUSER_EMAIL} to Unlimited tier.")
    else:
        db.add(
            UserSubscription(
                user_id=superuser.id,
                tier_id=unlimited.id,
                status="active",
                billing_period="monthly",
            )
        )
        db.commit()
        print(f"Created Unlimited subscription for {SUPERUSER_EMAIL}.")
    print(f"\n{SUPERUSER_EMAIL} is now on the Unlimited tier (unlimited searches, no quota).")


def main() -> None:
    db = SessionLocal()
    try:
        wipe_other_users_and_set_superuser(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
