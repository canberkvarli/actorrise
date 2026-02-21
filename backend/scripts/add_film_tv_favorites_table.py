"""
Migration: Add film_tv_favorites table for user-saved film/TV references.

Usage (from backend directory):
    uv run python scripts/add_film_tv_favorites_table.py

Safe to run multiple times (uses IF NOT EXISTS).
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text("""
        CREATE TABLE IF NOT EXISTS film_tv_favorites (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            film_tv_reference_id INTEGER NOT NULL REFERENCES film_tv_references(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """),
    text("CREATE INDEX IF NOT EXISTS film_tv_favorites_user_id_idx ON film_tv_favorites (user_id)"),
    text("CREATE INDEX IF NOT EXISTS film_tv_favorites_reference_id_idx ON film_tv_favorites (film_tv_reference_id)"),
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_film_tv_favorites_user_reference "
        "ON film_tv_favorites (user_id, film_tv_reference_id)"
    ),
]


def main() -> None:
    print("=" * 60)
    print("FILM/TV FAVORITES TABLE MIGRATION")
    print("=" * 60)
    print()
    print("Adding:")
    print("  - film_tv_favorites table")
    print("  - Unique constraint (user_id, film_tv_reference_id)")
    print()
    with engine.connect() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
        conn.commit()
    print("Done.")
    print()
    print("Next: Use POST/DELETE /api/film-tv/references/{id}/favorite and GET /api/film-tv/favorites/my")


if __name__ == "__main__":
    main()
