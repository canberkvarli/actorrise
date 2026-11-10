#!/usr/bin/env python
"""
Migration: playwright own-work fields on monologue_submissions (/for-playwrights).

is_own_work, buy_url, rights_confirmed_at. Add-only, IF NOT EXISTS, safe to run
before or after the deploy. The table already has RLS on.

Usage:
    uv run python scripts/add_playwright_submission_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

STATEMENTS = [
    "ALTER TABLE monologue_submissions ADD COLUMN IF NOT EXISTS is_own_work BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE monologue_submissions ADD COLUMN IF NOT EXISTS buy_url TEXT",
    "ALTER TABLE monologue_submissions ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMP WITH TIME ZONE",
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done: monologue_submissions has is_own_work, buy_url, rights_confirmed_at.")


if __name__ == "__main__":
    main()
