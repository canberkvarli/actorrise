"""
Add ``users.monologue_trial_ends_at`` (the reverse-trial window) in production.

``Base.metadata.create_all()`` only creates missing tables, never adds columns
to an existing one, so a live DB needs an explicit ALTER. Idempotent.

Two steps, intentionally separate so you control timing:

  1. Add the column (safe to run anytime, e.g. with the code deploy):
         python backend/scripts/add_monologue_trial.py

  2. Backfill existing users with a fresh 14-day window — run this at the SAME
     time you arm the meter (set free monologue_sessions -> 3), so nobody who
     already rehearsed gets instantly walled. Starts every existing user's clock
     from now:
         python backend/scripts/add_monologue_trial.py --backfill

New signups get their 14 days automatically (see app/api/auth.py).
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text

TRIAL_DAYS = 14


def add_column():
    db = SessionLocal()
    try:
        db.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "monologue_trial_ends_at TIMESTAMPTZ"
            )
        )
        db.commit()
        print("OK: users.monologue_trial_ends_at is present.")
    finally:
        db.close()


def backfill_existing():
    """Give every existing user without a trial a fresh window from now."""
    db = SessionLocal()
    try:
        result = db.execute(
            text(
                "UPDATE users SET monologue_trial_ends_at = now() + "
                f"interval '{TRIAL_DAYS} days' WHERE monologue_trial_ends_at IS NULL"
            )
        )
        db.commit()
        print(f"OK: backfilled {result.rowcount} users with a {TRIAL_DAYS}-day trial.")
    finally:
        db.close()


if __name__ == "__main__":
    add_column()
    if "--backfill" in sys.argv:
        backfill_existing()
