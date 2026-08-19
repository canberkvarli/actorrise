#!/usr/bin/env python
"""
Migration: search_logs.query_type.

The August outreach brief could not tell whether actors arrive naming a show
they were cast in or browsing by attribute. `query` holds the raw text but
nothing aggregates it. `query_type` is a rules classification written on the
logging path (app/services/search/query_type.py), values:

    title | named_lookup | occupation | attribute | multi | other

Log-only: nothing reads it back into ranking, so it cannot change results.

Run BEFORE deploying the code that writes this column.

Usage:
    uv run python scripts/add_search_query_type.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS query_type VARCHAR(20)",
    # Every analytics question about this column starts "in the last N days,
    # group by type", so index it alongside the time dimension.
    "CREATE INDEX IF NOT EXISTS ix_search_logs_query_type ON search_logs (query_type, created_at)",
]


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done - search_logs.query_type column + index.")


if __name__ == "__main__":
    main()
