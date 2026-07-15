"""
Add the ``actor_profiles.special_skills`` column in production.

``Base.metadata.create_all()`` only creates missing tables — it never adds
columns to an existing one. So adding this résumé field to a live database needs
an explicit ALTER. Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

(The new ``actor_credits`` table is created automatically by ``create_all`` on
deploy, so it needs no script — only this column does.)

Run once after deploying the model change:
    python backend/scripts/add_special_skills.py
"""

import sys
from pathlib import Path

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
                "special_skills JSONB DEFAULT '[]'::jsonb"
            )
        )
        db.commit()
        print("OK: actor_profiles.special_skills is present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
