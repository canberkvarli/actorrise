#!/usr/bin/env python
"""
Migration: search telemetry from the 2026-07 audit.

- search_logs.page         INT      1 = new search, >1 = pagination fetch
                                    (21% of rows were indistinguishable dupes)
- search_logs.weak_match   BOOLEAN  soft-fail banner shown (was computed but
                                    never stored — post-fix quality invisible)
- search_logs.best_cosine  REAL     best raw cosine of the result set
- monologue_views          TABLE    one row per monologue open; the missing
                                    funnel event between search and favorite

Run BEFORE deploying the code that writes these columns.

Usage:
    uv run python scripts/add_search_telemetry.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS page INTEGER",
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS weak_match BOOLEAN",
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS best_cosine REAL",
    """
    CREATE TABLE IF NOT EXISTS monologue_views (
        id SERIAL PRIMARY KEY,
        monologue_id INTEGER NOT NULL REFERENCES monologues(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        search_log_id INTEGER REFERENCES search_logs(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_monologue_views_created_at ON monologue_views (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_monologue_views_user_id ON monologue_views (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_monologue_views_monologue_id ON monologue_views (monologue_id)",
]


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done - search_logs telemetry columns + monologue_views table.")


if __name__ == "__main__":
    main()
