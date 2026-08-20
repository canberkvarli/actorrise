#!/usr/bin/env python
"""
Migration: search_logs.match_strategy.

Records which retrieval branch answered a search:

    title_exact             the query named a show we carry; its pieces were
                            returned directly and no vector query was run
    title_exact_backfilled  same, but the show had fewer pieces than a page,
                            so vector results were appended behind them
    vector                  the normal semantic path

H-07 (docs/metrics/hypotheses.md) predicts the title branch absorbs roughly a
third of weak matches; without this column the split is unmeasurable and the
hypothesis cannot be disconfirmed.

Log-only: nothing reads it back into ranking, so it cannot change results.

Run BEFORE deploying the code that writes this column.

Usage:
    uv run python scripts/add_search_match_strategy.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE search_logs ADD COLUMN IF NOT EXISTS match_strategy VARCHAR(24)",
    # Every question about this column starts "in the last N days, group by
    # strategy", so index it alongside the time dimension.
    "CREATE INDEX IF NOT EXISTS ix_search_logs_match_strategy "
    "ON search_logs (match_strategy, created_at)",
]


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
    print("Done - search_logs.match_strategy column + index.")


if __name__ == "__main__":
    main()
