#!/usr/bin/env python
"""
Migration: add last_seen_feature_id column to users.

Stores the id of the last changelog entry the user dismissed,
so the "What's new" modal shows once per actor (not per browser).

Usage:
    uv run python scripts/add_last_seen_feature_id_column.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_feature_id VARCHAR"))
    print("Done – last_seen_feature_id column added to users (or already existed).")


if __name__ == "__main__":
    main()
