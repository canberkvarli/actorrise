#!/usr/bin/env python
"""
Migration: add monologue repair/review-queue columns to monologues.

- review_status   TEXT     None | 'pending' (needs manual review)
- review_reasons  TEXT[]   residual quality-gate reasons
- proposed_text   TEXT     AI's best repair attempt, awaiting approval

NULL for every existing row. Populated by scripts/repair_monologues.py --apply.

Usage:
    uv run python scripts/add_review_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS review_status TEXT",
    "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS review_reasons TEXT[]",
    "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS proposed_text TEXT",
    "CREATE INDEX IF NOT EXISTS ix_monologues_review_status ON monologues (review_status)",
]


def main() -> None:
    with engine.begin() as conn:
        # Fail fast if another connection holds a lock, instead of hanging.
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done – review_status / review_reasons / proposed_text on monologues (or already existed).")


if __name__ == "__main__":
    main()
