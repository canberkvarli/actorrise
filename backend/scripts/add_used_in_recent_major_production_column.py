"""
One-time migration: add used_in_recent_major_production to monologues.

Enables filtering out material that has been used in recent major film/TV/theatre.

Usage (from backend directory):
    uv run python scripts/add_used_in_recent_major_production_column.py

Use DIRECT_DATABASE_URL to avoid Supabase pooler timeout (recommended for DDL):
    DIRECT_DATABASE_URL='...' uv run python scripts/add_used_in_recent_major_production_column.py
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
    database_url = os.getenv("DIRECT_DATABASE_URL") or settings.database_url
    if "DIRECT_DATABASE_URL" in os.environ and "sslmode=" not in database_url:
        database_url = f"{database_url}?sslmode=require" if "?" not in database_url else f"{database_url}&sslmode=require"

    use_pooler = "pooler.supabase.com" in database_url
    timeout_ms = 30000 if use_pooler else 600000

    steps = [
        (
            "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS used_in_recent_major_production BOOLEAN DEFAULT FALSE;",
            "  Column: monologues.used_in_recent_major_production added (if not present).",
        ),
        (
            "CREATE INDEX IF NOT EXISTS ix_monologues_used_in_recent_major_production ON monologues (used_in_recent_major_production);",
            "  Index: ix_monologues_used_in_recent_major_production created (if not present).",
        ),
    ]
    for sql, msg in steps:
        _run_one(database_url, sql, msg, timeout_ms)

    print("Done. Run backfill_used_in_recent_major_productions.py to populate from LLM.")


if __name__ == "__main__":
    main()
