#!/usr/bin/env python
"""
Migration: add user_scripts.shared_with_community (Green Room community library).

When an actor opts to share an uploaded script, its two-person scenes become
rehearsable by the community. Default false (private). See
docs/plans/2026-07-24-green-room-design.md.

Usage:
    uv run python scripts/add_shared_with_community_column.py
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
        "ALTER TABLE user_scripts ADD COLUMN IF NOT EXISTS shared_with_community "
        "BOOLEAN NOT NULL DEFAULT FALSE"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_user_scripts_shared_with_community "
        "ON user_scripts (shared_with_community)"
    ),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done - user_scripts.shared_with_community added.")


if __name__ == "__main__":
    main()
