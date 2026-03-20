#!/usr/bin/env python
"""
Migration: add search_logs table for search analytics.

Tracks every search query with filters, result count, and returned monologue IDs.

Usage:
    uv run python scripts/add_search_logs_table.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text(
        """
        CREATE TABLE IF NOT EXISTS search_logs (
            id SERIAL PRIMARY KEY,
            query TEXT NOT NULL,
            filters_used JSONB,
            results_count INTEGER NOT NULL DEFAULT 0,
            result_ids JSONB,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            source VARCHAR(20) NOT NULL DEFAULT 'search',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_search_logs_created_at ON search_logs (created_at)"),
    text("CREATE INDEX IF NOT EXISTS ix_search_logs_user_id ON search_logs (user_id)"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done – search_logs table created.")


if __name__ == "__main__":
    main()
