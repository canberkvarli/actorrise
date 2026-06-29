"""
Add the ``users.has_seen_first_rehearsal`` column in production.

``Base.metadata.create_all()`` only creates missing tables — it never adds
columns to an existing one. So adding this flag to a live database needs an
explicit ALTER. Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

Run once after deploying the model change:
    python backend/scripts/add_has_seen_first_rehearsal.py
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
                "has_seen_first_rehearsal BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        db.commit()
        print("OK: users.has_seen_first_rehearsal is present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
