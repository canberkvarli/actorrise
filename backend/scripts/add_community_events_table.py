#!/usr/bin/env python
"""
Migration: add community_events table + users.share_activity column.

Powers the "Green Room" community feed — a public pulse of platform activity.
See docs/plans/2026-07-24-community-feed-design.md.

Privacy: community_events NEVER stores raw search text. share_activity is the
per-user opt-out; the feed read filters on it, so flipping it hides a user's
whole history retroactively.

Usage:
    uv run python scripts/add_community_events_table.py
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
        CREATE TABLE IF NOT EXISTS community_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            event_type VARCHAR(20) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    # The feed read is a single created_at DESC scan — this index carries it.
    text(
        "CREATE INDEX IF NOT EXISTS ix_community_events_created_at "
        "ON community_events (created_at DESC)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_community_events_user_id "
        "ON community_events (user_id)"
    ),
    # Per-user opt-out. Default TRUE = existing users appear unless they opt out.
    text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS share_activity "
        "BOOLEAN NOT NULL DEFAULT TRUE"
    ),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done - community_events table + users.share_activity created.")


if __name__ == "__main__":
    main()
