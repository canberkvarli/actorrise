#!/usr/bin/env python
"""
Migration: class_links.plan_ends_at (app/models/class_link.py).

A school that pays for a class plan gets one end date for every student on the
link, not 30 days from each student's own signup. Nullable; a link without a
plan keeps working exactly as before.

Run this BEFORE the deploy that reads the column: the model selects it, so
every class-link query fails on a database that does not have it yet.

Usage:
    uv run python scripts/add_class_link_plan_column.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE class_links ADD COLUMN IF NOT EXISTS plan_ends_at TIMESTAMP WITH TIME ZONE"))
    print("class_links.plan_ends_at: present")


if __name__ == "__main__":
    main()
