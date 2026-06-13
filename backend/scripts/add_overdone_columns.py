#!/usr/bin/env python
"""
Migration: add overdone-scoring columns to monologues.

- overdone_reason     TEXT         one-line "why" from the AI scorer
- overdone_scored_at  TIMESTAMPTZ  when the row was scored (idempotency guard)

(`overdone_score` already exists on the table.) NULL for every existing row.
Populated by scripts/score_overdone.py --apply.

Usage:
    uv run python scripts/add_overdone_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS overdone_reason TEXT",
    "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS overdone_scored_at TIMESTAMPTZ",
]


def main() -> None:
    with engine.begin() as conn:
        # Fail fast if another connection holds a lock, instead of hanging.
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done – overdone_reason / overdone_scored_at on monologues (or already existed).")


if __name__ == "__main__":
    main()
