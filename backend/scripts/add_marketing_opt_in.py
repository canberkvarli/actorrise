#!/usr/bin/env python
"""
Migration: Add marketing_opt_in to users table.

- marketing_opt_in: Boolean, default False. Set True only when user explicitly
  opts in at signup or in settings. Do not add users to marketing by default.

Usage:
    uv run python scripts/add_marketing_opt_in.py

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
        conn.execute(
            text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT FALSE NOT NULL"
            )
        )
        conn.commit()
    print("✓ marketing_opt_in column added to users (if not present).")


if __name__ == "__main__":
    main()
