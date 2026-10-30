#!/usr/bin/env python
"""
Migration: add email_batches.variables_json.

Holds the variables a bulk or campaign batch was sent with (the custom body,
button, sender), so resume_batch in admin/emails.py can rebuild the same
email. Run before deploying the code that reads it: the ORM selects every
mapped column, so without it every batch query fails.

Why this exists: batch 25 (the scene partner email, 2026-10-29) stalled at
98 of 1,415 when three deploys killed its worker. Resume rendered with only
the name and unsubscribe link, which for the custom template is a letter
with no body, so the rest had to be sent by hand from a script.

Usage:
    uv run python scripts/add_email_batches_variables_json.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text("ALTER TABLE email_batches ADD COLUMN IF NOT EXISTS variables_json JSONB"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("email_batches.variables_json added (or already present).")


if __name__ == "__main__":
    main()
