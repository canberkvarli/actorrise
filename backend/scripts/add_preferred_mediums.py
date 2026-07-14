"""
Add the ``actor_profiles.preferred_mediums`` column in production.

``Base.metadata.create_all()`` only creates missing tables — it never adds
columns to an existing one. So adding this preference to a live database needs
an explicit ALTER. Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

Stores the actor's preferred mediums (``["theatre","film","tv"]``), used to
filter monologues by ``Play.source_type`` during profile-first onboarding.

Run once after deploying the model change:
    python backend/scripts/add_preferred_mediums.py
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
                "ALTER TABLE actor_profiles ADD COLUMN IF NOT EXISTS "
                "preferred_mediums JSONB DEFAULT '[]'::jsonb"
            )
        )
        db.commit()
        print("OK: actor_profiles.preferred_mediums is present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
