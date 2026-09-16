"""
Add ``users.has_seen_collection_tour`` and ``users.has_seen_scenepartner_tour``.

``Base.metadata.create_all()`` only creates missing tables, never columns on an
existing one, so adding these flags to a live database needs an explicit ALTER.
Idempotent (``IF NOT EXISTS``), safe to run repeatedly.

Run once after deploying the model change:
    python backend/scripts/add_tour_flags.py

Defaults FALSE, which is what makes a NEW signup eligible for a tour.

The two columns were then treated differently on purpose, and the difference
is not visible from this file alone:

  - has_seen_collection_tour was left FALSE everywhere, so the Collection tour
    was offered to every account that already existed.
  - has_seen_scenepartner_tour was backfilled to TRUE for all 1054 accounts
    that existed on 2026-09-17, so the ScenePartner tour only ever meets
    people who sign up after it shipped. Canberk's call: a followspot walking
    1054 people through a room they have been using for months is an
    interruption, not an introduction.

So re-running this script does NOT re-offer the ScenePartner tour to anyone —
ADD COLUMN IF NOT EXISTS leaves the existing values alone. To offer it to an
individual account (to see it yourself, say), the admin's "reset first run"
on /admin/users/<id> sets every tour flag back to FALSE.
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text

COLUMNS = ("has_seen_collection_tour", "has_seen_scenepartner_tour")


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
