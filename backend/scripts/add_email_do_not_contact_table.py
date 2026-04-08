#!/usr/bin/env python
"""
Migration: add email_do_not_contact table.

Stores email addresses that should be permanently excluded from marketing
sends (friends, test accounts, etc).

Usage:
    uv run python scripts/add_email_do_not_contact_table.py
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
        CREATE TABLE IF NOT EXISTS email_do_not_contact (
            id SERIAL PRIMARY KEY,
            email VARCHAR NOT NULL UNIQUE,
            name VARCHAR,
            reason VARCHAR,
            added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_email_do_not_contact_email ON email_do_not_contact (email)"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done – email_do_not_contact table created.")


if __name__ == "__main__":
    main()
