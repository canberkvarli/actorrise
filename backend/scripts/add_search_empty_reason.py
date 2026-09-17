#!/usr/bin/env python
"""
Migration: search_logs.empty_reason.

Says WHY a search returned nothing:

    no_candidates     the hard filters matched no row carrying an embedding —
                      an empty filter set, not a failed query
    below_floor       candidates existed; every one was below the relevance floor
    embedding_failed  the query embedding could not be generated
    vector_error      the pgvector query raised; the text fallback found nothing
    cached_empty      an earlier empty result set, served from cache

Written because all four logged identically: results_count=0 with best_cosine
NULL. Four such searches in the 30 days to 2026-09-17 ("Shakespeare", "sad
monologues", "court", "courtroom") read as a broken code path and were in fact
an empty filter set — every one of them carried category=contemporary +
source_type=play, a two-tap combination that matches 4 monologues out of 19,351.
That took a session to establish from the table and should take one query.

Log-only: nothing reads it back into ranking, so it cannot change results.

Run BEFORE deploying the code that writes this column.

Usage:
    uv run python scripts/add_search_empty_reason.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS empty_reason VARCHAR(24)",
    # Partial: only empty searches carry a reason, so a full index would be
    # mostly dead weight serving a lookup that never asks for NULL.
    "CREATE INDEX IF NOT EXISTS ix_search_logs_empty_reason "
    "ON search_logs (empty_reason, created_at) WHERE empty_reason IS NOT NULL",
]


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done - search_logs.empty_reason column + partial index.")


if __name__ == "__main__":
    main()
