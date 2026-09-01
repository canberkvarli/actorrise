#!/usr/bin/env python
"""
Migration: monologue_views.client.

Which client opened the piece — "web" or "ghostlight". The free-read wall is a
SEPARATE trial per client as of 2026-09-01:

    web         5 distinct pieces per calendar month
    ghostlight  3 distinct pieces, for life

Without this column both clients count the same rows, so the two allowances
pool: an actor who reads five pieces on the web opens the app to a trial that
is already spent, and one who spends the app's three arrives on the web with
two reads gone.

Left NULL for every existing row on purpose. Each one was written by the web
detail page — the app's path is POST /{id}/read, which did not write views at
all — so the read side treats NULL as web rather than backfilling a guess.
Ghost Light's lifetime trial therefore starts at zero for everyone, which is
what a trial that has never been offered should do.

Run BEFORE deploying the code that writes this column: the model selects it, so
an authed detail request against an un-migrated database 500s.

Usage:
    uv run python scripts/add_monologue_view_client.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    "ALTER TABLE monologue_views ADD COLUMN IF NOT EXISTS client VARCHAR(16)",
    # The wall asks "distinct pieces for this user on this client" on every
    # detail open, so it must not scan the user's whole view history.
    "CREATE INDEX IF NOT EXISTS ix_monologue_views_user_client "
    "ON monologue_views (user_id, client)",
]


def main() -> int:
    with engine.begin() as conn:
        for statement in STATEMENTS:
            print(f"  {statement}")
            conn.execute(text(statement))

    with engine.connect() as conn:
        total = conn.execute(
            text("SELECT count(*) FROM monologue_views")
        ).scalar_one()
        unlabelled = conn.execute(
            text("SELECT count(*) FROM monologue_views WHERE client IS NULL")
        ).scalar_one()
    print(f"\nmonologue_views: {total} rows, {unlabelled} NULL client (read as web)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
