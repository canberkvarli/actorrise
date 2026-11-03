#!/usr/bin/env python
"""
Migration: loop_snapshots, what the daily loop saw each day.

The loop reads "what moved" by comparing today with yesterday: a trial that went
paid, a renewal turned off, a class link that gained joins. On the laptop
yesterday was a file in outputs/conversion/. A cloud session starts from a fresh
clone every morning and has no yesterday, so each day's picture is kept here
(scripts/loop_snapshot.py), one row per day and kind, 30 days of them. New table
only, safe to run before or after the deploy.

Usage:
    uv run python scripts/add_loop_snapshots_table.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

STATEMENTS = [
    text(
        """
        CREATE TABLE IF NOT EXISTS loop_snapshots (
            id SERIAL PRIMARY KEY,
            day DATE NOT NULL,
            kind VARCHAR(32) NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE (day, kind)
        )
        """
    ),
    # RLS on, no policies: the brief names people, read only by the scripts over
    # the service connection (rls-lockdown 2026-08-23).
    text("ALTER TABLE loop_snapshots ENABLE ROW LEVEL SECURITY"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done: loop_snapshots exists.")


if __name__ == "__main__":
    main()
