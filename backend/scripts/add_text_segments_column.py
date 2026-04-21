#!/usr/bin/env python
"""
Migration: add text_segments JSONB column to monologues.

Stores structured render segments as an array of
{ type, speaker?, text } objects. NULL for pre-backfill rows.

Usage:
    uv run python scripts/add_text_segments_column.py
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
        # Fail fast (5s) if another connection is holding a lock on the table,
        # instead of hanging forever waiting for ACCESS EXCLUSIVE.
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        conn.execute(text("ALTER TABLE monologues ADD COLUMN IF NOT EXISTS text_segments JSONB"))
    print("Done – text_segments column added to monologues (or already existed).")


if __name__ == "__main__":
    main()
