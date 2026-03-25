#!/usr/bin/env python
"""
Migration: add source_type and film_tv_reference_id columns to the plays table.

This allows the plays table to also hold film & TV screenplays so that
monologues from films/TV reuse the entire existing search infrastructure.

Usage:
    uv run python scripts/add_play_source_type.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import os
from sqlalchemy import create_engine as _create_engine, text

from app.core.config import settings


def _get_direct_engine():
    """
    Create a direct connection to Postgres (bypassing Supabase pooler timeouts).
    Supabase pooler URLs use port 6543; direct connections use port 5432.
    If DATABASE_URL_DIRECT is set, use that. Otherwise swap port 6543 → 5432.
    """
    direct_url = os.getenv("DATABASE_URL_DIRECT")
    if not direct_url:
        direct_url = settings.database_url.replace(":6543/", ":5432/")
    return _create_engine(direct_url)


STATEMENTS = [
    # 1a. Add source_type column as NULLABLE with DEFAULT (Postgres 11+ is instant)
    text(
        """
        ALTER TABLE plays
        ADD COLUMN IF NOT EXISTS source_type VARCHAR DEFAULT 'play';
        """
    ),
    # 1b. Backfill NULLs (should be none, but just in case)
    text(
        """
        UPDATE plays SET source_type = 'play' WHERE source_type IS NULL;
        """
    ),
    # 1c. Set NOT NULL constraint
    text(
        """
        ALTER TABLE plays ALTER COLUMN source_type SET NOT NULL;
        """
    ),
    # 2. Index on source_type
    text(
        """
        CREATE INDEX IF NOT EXISTS ix_plays_source_type ON plays (source_type);
        """
    ),
    # 3. Add film_tv_reference_id FK column (nullable)
    text(
        """
        ALTER TABLE plays
        ADD COLUMN IF NOT EXISTS film_tv_reference_id INTEGER
        REFERENCES film_tv_references(id) ON DELETE SET NULL;
        """
    ),
    # 4. Partial index on FK
    text(
        """
        CREATE INDEX IF NOT EXISTS ix_plays_film_tv_reference_id
        ON plays (film_tv_reference_id)
        WHERE film_tv_reference_id IS NOT NULL;
        """
    ),
]


def main() -> None:
    # Try direct connection first, fall back to pooler
    try:
        eng = _get_direct_engine()
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Using DIRECT Postgres connection (no pooler timeout)")
    except Exception:
        from app.core.database import engine as eng
        print("Direct connection failed, using pooler (may timeout on large tables)")

    with eng.connect() as conn:
        # Try to increase timeout (works on direct connections)
        try:
            conn.execute(text("SET statement_timeout = '300s';"))
            conn.commit()
            print("Set statement_timeout = 300s")
        except Exception:
            conn.rollback()

        for stmt in STATEMENTS:
            try:
                conn.execute(stmt)
                conn.commit()
                print(f"OK  {stmt.text.strip()[:80]}...")
            except Exception as exc:
                conn.rollback()
                print(f"SKIP {exc}")
    print("\nDone — plays table now supports source_type and film_tv_reference_id.")


if __name__ == "__main__":
    main()
