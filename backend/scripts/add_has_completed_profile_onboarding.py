"""
Add the ``users.has_completed_profile_onboarding`` column in production.

``Base.metadata.create_all()`` only creates missing tables — it never adds
columns to an existing one. So adding this flag to a live database needs an
explicit ALTER. Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

Distinct from the legacy ``has_completed_onboarding``: this marks completion of
the 5-tap profile-first onboarding. Existing users default to FALSE so the soft
backfill card can invite them to personalize.

Run once after deploying the model change:
    python backend/scripts/add_has_completed_profile_onboarding.py
"""

import sys
from pathlib import Path

# Add backend directory to path for imports
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text


def add_column():
    db = SessionLocal()
    try:
        db.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "has_completed_profile_onboarding BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        db.commit()
        print("OK: users.has_completed_profile_onboarding is present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
