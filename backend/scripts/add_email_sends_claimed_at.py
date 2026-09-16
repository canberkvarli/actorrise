#!/usr/bin/env python
"""
Migration: add email_sends.claimed_at.

Backs the "sending" claim in admin/emails.py resume_batch. A worker flips
rows to status='sending' and stamps claimed_at in one atomic UPDATE before it
mails anyone, so a second concurrent resume finds nothing to take. Without
this column _claim_sends raises and every resume fails.

Why this exists: the Ghost Light launch (batch 22) had 372 rows marked
"failed" after Gmail dropped SMTP connections. "Send the rest" was pressed
more than once on 2026-09-16 and, with no claim guard, each press ran its own
loop over the same 372 rows. 353 people received 3 to 5 copies within seconds.

Usage:
    uv run python scripts/add_email_sends_claimed_at.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text("ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP WITH TIME ZONE"),
    # Resume looks for stale claims by (batch_id, status, claimed_at).
    text(
        "CREATE INDEX IF NOT EXISTS ix_email_sends_batch_status "
        "ON email_sends (batch_id, status)"
    ),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("email_sends.claimed_at added (or already present).")


if __name__ == "__main__":
    main()
