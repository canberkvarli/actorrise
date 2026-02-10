"""
One-time migration: add act and scene columns to monologues.

This enables searching monologues by act/scene (e.g., "Hamlet Act 3 Scene 1").

Usage (from backend directory):
    uv run python scripts/add_act_scene_columns.py

Use DIRECT_DATABASE_URL to avoid Supabase pooler timeout (recommended for DDL):
    DIRECT_DATABASE_URL='postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres' uv run python scripts/add_act_scene_columns.py

Get the direct connection string: Supabase Dashboard → Project Settings → Database
→ Connection string → "Direct connection" (not "Session pooler").
"""

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import psycopg2

from app.core.config import settings


def _run_one(database_url: str, sql: str, msg: str, timeout_ms: int = 600000) -> None:
    conn = psycopg2.connect(database_url, options=f"-c statement_timeout={timeout_ms}")
    conn.autocommit = True
    try:
        conn.cursor().execute(sql)
        print(msg)
    finally:
        conn.close()


def main() -> None:
    # Prefer direct DB URL to bypass pooler timeout (Supabase SQL Editor / pooler kill long DDL)
    database_url = os.getenv("DIRECT_DATABASE_URL") or settings.database_url
    if "DIRECT_DATABASE_URL" in os.environ and "sslmode=" not in database_url:
        database_url = f"{database_url}?sslmode=require" if "?" not in database_url else f"{database_url}&sslmode=require"

    use_pooler = "pooler.supabase.com" in database_url
    # One short-lived connection per statement when using pooler so each may finish before pooler timeout
    timeout_ms = 30000 if use_pooler else 600000  # 30s per statement vs 10 min

    steps = [
        ("ALTER TABLE monologues ADD COLUMN IF NOT EXISTS act INTEGER;", "  Column: monologues.act added (if not present)."),
        ("ALTER TABLE monologues ADD COLUMN IF NOT EXISTS scene INTEGER;", "  Column: monologues.scene added (if not present)."),
        ("CREATE INDEX IF NOT EXISTS ix_monologues_act ON monologues (act);", "  Index: ix_monologues_act created (if not present)."),
        ("CREATE INDEX IF NOT EXISTS ix_monologues_scene ON monologues (scene);", "  Index: ix_monologues_scene created (if not present)."),
    ]
    for sql, msg in steps:
        _run_one(database_url, sql, msg, timeout_ms)

    print("Done. Run parse_act_scene_from_plays.py to populate data for classical works.")


if __name__ == "__main__":
    main()
