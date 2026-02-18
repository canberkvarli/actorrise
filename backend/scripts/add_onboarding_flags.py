#!/usr/bin/env python
"""
Migration: Add onboarding tracking flags to users table.

- has_seen_welcome: Boolean, default False. Set True after welcome modal dismissed.
- has_seen_search_tour: Boolean, default False. Set True after search tour dismissed.

Usage:
    uv run python scripts/add_onboarding_flags.py

Safe to run multiple times (uses IF NOT EXISTS).
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.core.database import engine


def main() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS has_seen_welcome BOOLEAN DEFAULT FALSE NOT NULL"
        ))
        conn.execute(text(
            "ALTER TABLE users "
            "ADD COLUMN IF NOT EXISTS has_seen_search_tour BOOLEAN DEFAULT FALSE NOT NULL"
        ))
        conn.commit()
    print("✓ has_seen_welcome and has_seen_search_tour columns added to users.")


if __name__ == "__main__":
    main()
