"""
One-time migration: add total_searches_count to usage_metrics.

Used for the public "live count" (monologue + film/TV + demo). Backfills from ai_searches_count
so the number doesn't drop.

Usage (from backend directory):
    uv run python scripts/add_total_searches_count.py

Use DIRECT_DATABASE_URL to avoid Supabase pooler timeout (recommended for DDL):
    DIRECT_DATABASE_URL='...' uv run python scripts/add_total_searches_count.py
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
            "ALTER TABLE usage_metrics ADD COLUMN IF NOT EXISTS total_searches_count INTEGER NOT NULL DEFAULT 0;",
            "  Column: usage_metrics.total_searches_count added (if not present).",
        ),
        (
            "UPDATE usage_metrics SET total_searches_count = ai_searches_count WHERE total_searches_count = 0;",
            "  Backfilled total_searches_count from ai_searches_count.",
        ),
    ]
    for sql, msg in steps:
        _run_one(database_url, sql, msg, timeout_ms)

    print("Done. Public /api/public/stats now uses total_searches_count (all search types).")


if __name__ == "__main__":
    main()
