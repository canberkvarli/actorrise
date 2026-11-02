#!/usr/bin/env python
"""
Migration: contact_log, the record of who Canberk (or the loops) wrote to.

Until 2026-11-02 this lived in files on one laptop (outputs/conversion/contacts.csv,
written.txt, each week's tracker-append.csv). A cloud session clones the repo and
sees none of them, so a morning run there would write to the same people again.
In the database every session reads the same record. New table only, safe to run
before or after the deploy; `contact_log.py import` then copies the files in.

Usage:
    uv run python scripts/add_contact_log_table.py
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
        CREATE TABLE IF NOT EXISTS contact_log (
            id SERIAL PRIMARY KEY,
            contacted_on DATE,
            address VARCHAR(320) NOT NULL DEFAULT '',
            domain VARCHAR(255) NOT NULL DEFAULT '',
            organization VARCHAR(255) NOT NULL DEFAULT '',
            kind VARCHAR(64) NOT NULL,
            subject TEXT NOT NULL DEFAULT '',
            source VARCHAR(255) NOT NULL DEFAULT 'contact_log',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_contact_log_address ON contact_log (address)"),
    text("CREATE INDEX IF NOT EXISTS ix_contact_log_domain ON contact_log (domain)"),
    # RLS on, no policies: names and addresses, read only by the scripts over
    # the service connection (rls-lockdown 2026-08-23).
    text("ALTER TABLE contact_log ENABLE ROW LEVEL SECURITY"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done: contact_log exists.")


if __name__ == "__main__":
    main()
