#!/usr/bin/env python
"""
Migration: partner columns on organizations (app/models/organization.py).

New nullable columns plus one with a default, nothing existing changes, so it is
safe to run before the deploy. Run it BEFORE pushing: the model selects these
columns and every org query fails until they exist.

Usage:
    uv run python scripts/add_organization_partner_columns.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_status VARCHAR(16) NOT NULL DEFAULT 'none'"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_show VARCHAR(8)"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_display_name VARCHAR(200)"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_url VARCHAR(500)"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_logo_url VARCHAR(500)"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_links_us_at VARCHAR(500)"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_approval TEXT"),
    text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_updated_at TIMESTAMP WITH TIME ZONE"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("organizations: partner columns in place")


if __name__ == "__main__":
    main()
