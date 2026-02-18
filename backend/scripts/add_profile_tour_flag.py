#!/usr/bin/env python
"""
Migration: Add has_seen_profile_tour to users table.

- has_seen_profile_tour: Boolean, default False. Set True after profile tour dismissed.

Usage:
    uv run python scripts/add_profile_tour_flag.py

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
            "ADD COLUMN IF NOT EXISTS has_seen_profile_tour BOOLEAN DEFAULT FALSE NOT NULL"
        ))
        conn.commit()
    print("✓ has_seen_profile_tour column added to users.")


if __name__ == "__main__":
    main()
