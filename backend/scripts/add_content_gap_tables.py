#!/usr/bin/env python
"""
Migration: add content_requests table and content_gap column to search_logs.

Usage:
    uv run python scripts/add_content_gap_tables.py
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
        CREATE TABLE IF NOT EXISTS content_requests (
            id SERIAL PRIMARY KEY,
            play_title VARCHAR NOT NULL,
            author VARCHAR,
            character_name VARCHAR,
            request_count INTEGER NOT NULL DEFAULT 1,
            first_requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            last_requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            status VARCHAR(20) NOT NULL DEFAULT 'requested'
        )
        """
    ),
    text("CREATE UNIQUE INDEX IF NOT EXISTS ix_content_requests_play_author ON content_requests (play_title, author)"),
    text("ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS content_gap JSONB"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done – content_requests table created, content_gap column added to search_logs.")


if __name__ == "__main__":
    main()
