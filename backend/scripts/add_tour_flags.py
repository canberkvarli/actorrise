"""
Add ``users.has_seen_collection_tour``.

``Base.metadata.create_all()`` only creates missing tables, never columns on an
existing one, so adding these flags to a live database needs an explicit ALTER.
Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

Run once after deploying the model change:
    python backend/scripts/add_tour_flags.py

Defaults FALSE, so every existing account is offered the Collection tour the
next time they open it. That is deliberate: the tour has never run, so nobody
has "already seen" it.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text

COLUMNS = ("has_seen_collection_tour",)


def add_columns():
    db = SessionLocal()
    try:
        for col in COLUMNS:
            db.execute(
                text(
                    f"ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                    f"{col} BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
        db.commit()
        print("OK: " + ", ".join(f"users.{c}" for c in COLUMNS) + " are present.")
    finally:
        db.close()


if __name__ == "__main__":
    add_columns()
