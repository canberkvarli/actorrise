#!/usr/bin/env python3
"""
Schema migration for the Rehearse Hub feature set.

Adds (idempotently — safe to re-run):
  - scenes.is_library            BOOLEAN NOT NULL DEFAULT FALSE  (+ index)
  - users.has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE
  - users.referral_source        VARCHAR NULL

`Base.metadata.create_all` only creates missing *tables*, never new columns on
existing tables, so these ALTERs are required. Postgres supports
`ADD COLUMN IF NOT EXISTS`, which makes this naturally idempotent.

Usage:
    python scripts/migrate_rehearse_hub.py
    # or: DATABASE_URL='...' python scripts/migrate_rehearse_hub.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine


STATEMENTS = [
    "ALTER TABLE scenes ADD COLUMN IF NOT EXISTS is_library BOOLEAN NOT NULL DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS ix_scenes_is_library ON scenes (is_library)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_source VARCHAR",
    "ALTER TABLE monologue_favorites ADD COLUMN IF NOT EXISTS memorized BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE monologue_favorites ADD COLUMN IF NOT EXISTS last_studied_at TIMESTAMPTZ",
    "ALTER TABLE monologue_favorites ADD COLUMN IF NOT EXISTS cut_start_line INTEGER",
    "ALTER TABLE monologue_favorites ADD COLUMN IF NOT EXISTS cut_end_line INTEGER",
]


def main():
    target = settings.database_url
    print("=" * 60)
    print("MIGRATION: Rehearse Hub schema")
    print("=" * 60)
    print(f"Target: {target.split('@')[-1] if '@' in target else target}")

    with engine.begin() as conn:
        for stmt in STATEMENTS:
            print(f"  -> {stmt}")
            conn.execute(text(stmt))

    print("Done. Schema is up to date.")


if __name__ == "__main__":
    main()
