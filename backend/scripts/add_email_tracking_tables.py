#!/usr/bin/env python
"""
Migration: add email tracking tables.

Adds:
1) email_batches   - tracks bulk/campaign email operations
2) email_sends     - tracks individual sends with webhook status

Usage:
    uv run python scripts/add_email_tracking_tables.py
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
        CREATE TABLE IF NOT EXISTS email_batches (
            id SERIAL PRIMARY KEY,
            template_id VARCHAR NOT NULL,
            campaign_key VARCHAR,
            subject VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'pending',
            total INTEGER NOT NULL DEFAULT 0,
            sent INTEGER NOT NULL DEFAULT 0,
            skipped INTEGER NOT NULL DEFAULT 0,
            errors_json JSONB DEFAULT '[]'::jsonb,
            created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scheduled_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    ),
    text(
        """
        CREATE TABLE IF NOT EXISTS email_sends (
            id SERIAL PRIMARY KEY,
            batch_id INTEGER NOT NULL REFERENCES email_batches(id) ON DELETE CASCADE,
            resend_email_id VARCHAR,
            to_email VARCHAR NOT NULL,
            to_name VARCHAR DEFAULT '',
            status VARCHAR NOT NULL DEFAULT 'queued',
            opened_at TIMESTAMP WITH TIME ZONE,
            clicked_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_email_batches_campaign_key ON email_batches(campaign_key)"),
    text("CREATE INDEX IF NOT EXISTS ix_email_batches_created_by ON email_batches(created_by)"),
    text("CREATE INDEX IF NOT EXISTS ix_email_batches_status ON email_batches(status)"),
    text("CREATE INDEX IF NOT EXISTS ix_email_sends_batch_id ON email_sends(batch_id)"),
    text("CREATE INDEX IF NOT EXISTS ix_email_sends_resend_email_id ON email_sends(resend_email_id)"),
    text("CREATE INDEX IF NOT EXISTS ix_email_sends_to_email ON email_sends(to_email)"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("✓ email tracking tables ensured.")


if __name__ == "__main__":
    main()
