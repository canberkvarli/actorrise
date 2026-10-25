#!/usr/bin/env python
"""
Migration: shelf_scenes (app/models/shelf.py).

A new table only, nothing existing changes, so it is safe to run before or
after the deploy. Rows are pointers of about a kilobyte; no text, no vector.

Usage:
    uv run python scripts/add_shelf_scenes_table.py
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
        CREATE TABLE IF NOT EXISTS shelf_scenes (
            id SERIAL PRIMARY KEY,
            kind VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'live',
            work_title VARCHAR(200) NOT NULL,
            work_kind VARCHAR(8) NOT NULL DEFAULT 'play',
            author VARCHAR(200),
            year INTEGER,
            play_id INTEGER REFERENCES plays(id) ON DELETE CASCADE,
            start_offset INTEGER,
            end_offset INTEGER,
            text_hash VARCHAR(64),
            shared_by_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            source_scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
            show_name BOOLEAN NOT NULL DEFAULT FALSE,
            where_in_work VARCHAR(200),
            title VARCHAR(200) NOT NULL,
            description TEXT,
            character_1_name VARCHAR(80) NOT NULL,
            character_2_name VARCHAR(80) NOT NULL,
            character_1_gender VARCHAR(16),
            character_2_gender VARCHAR(16),
            character_1_age_range VARCHAR(16),
            character_2_age_range VARCHAR(16),
            duration_seconds INTEGER,
            line_count INTEGER,
            tone VARCHAR(32),
            era VARCHAR(16),
            open_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE
        )
        """
    ),
    text("CREATE INDEX IF NOT EXISTS ix_shelf_scenes_kind ON shelf_scenes (kind)"),
    text("CREATE INDEX IF NOT EXISTS ix_shelf_scenes_status ON shelf_scenes (status)"),
    text("CREATE INDEX IF NOT EXISTS ix_shelf_scenes_play_id ON shelf_scenes (play_id)"),
    text("CREATE INDEX IF NOT EXISTS ix_shelf_scenes_shared_by_user_id ON shelf_scenes (shared_by_user_id)"),
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_shelf_scenes_play_span "
        "ON shelf_scenes (play_id, start_offset, end_offset) WHERE play_id IS NOT NULL"
    ),
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_shelf_scenes_source_scene "
        "ON shelf_scenes (source_scene_id) WHERE source_scene_id IS NOT NULL"
    ),
    # Supabase: every public table has RLS on since 2026-08-23. The backend
    # connects as the owner and is not affected; the anon key reads nothing.
    text("ALTER TABLE shelf_scenes ENABLE ROW LEVEL SECURITY"),
]


def main() -> None:
    with engine.begin() as conn:
        for statement in STATEMENTS:
            conn.execute(statement)
    print("shelf_scenes: in place")


if __name__ == "__main__":
    main()
