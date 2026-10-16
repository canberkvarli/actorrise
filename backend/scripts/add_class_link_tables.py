#!/usr/bin/env python
"""
Migration: class_links and class_link_joins (app/models/class_link.py).

New tables only, nothing existing changes, so it is safe to run before or
after the deploy.

Usage:
    uv run python scripts/add_class_link_tables.py
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
        CREATE TABLE IF NOT EXISTS class_links (
            id SERIAL PRIMARY KEY,
            code VARCHAR(64) NOT NULL UNIQUE,
            teacher_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
            teacher_label VARCHAR(80) NOT NULL,
            school_label VARCHAR(120),
            days INTEGER NOT NULL DEFAULT 30,
            max_uses INTEGER NOT NULL DEFAULT 60,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_class_links_teacher_user_id ON class_links (teacher_user_id)"),
    text(
        """
        CREATE TABLE IF NOT EXISTS class_link_joins (
            id SERIAL PRIMARY KEY,
            class_link_id INTEGER NOT NULL REFERENCES class_links(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            outcome VARCHAR(16) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_class_link_joins_link_user UNIQUE (class_link_id, user_id)
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_class_link_joins_user_id ON class_link_joins (user_id)"),
    # RLS on, no policies: the API reaches these with the service connection,
    # and anon must not read who is in whose class (rls-lockdown 2026-08-23).
    text("ALTER TABLE class_links ENABLE ROW LEVEL SECURITY"),
    text("ALTER TABLE class_link_joins ENABLE ROW LEVEL SECURITY"),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Done: class_links and class_link_joins exist.")


if __name__ == "__main__":
    main()
