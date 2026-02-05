"""
Create or verify indexes to speed up monologue text search.

PostgreSQL only; requires the `pg_trgm` extension.

Usage (from project root or backend directory):

    python backend/scripts/create_search_indexes.py
    # or from backend:
    uv run python scripts/create_search_indexes.py

Safe to run multiple times; uses IF NOT EXISTS where supported.
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    # Enable pg_trgm (idempotent)
    text("CREATE EXTENSION IF NOT EXISTS pg_trgm"),
    # Trigram indexes for fields used in ILIKE-based fallback search.
    text(
        "CREATE INDEX IF NOT EXISTS idx_monologues_title_trgm "
        "ON monologues USING GIN (title gin_trgm_ops)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_monologues_text_trgm "
        "ON monologues USING GIN (text gin_trgm_ops)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_monologues_character_name_trgm "
        "ON monologues USING GIN (character_name gin_trgm_ops)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_plays_title_trgm "
        "ON plays USING GIN (title gin_trgm_ops)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_plays_author_trgm "
        "ON plays USING GIN (author gin_trgm_ops)"
    ),
]


def main() -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("Search indexes created / verified successfully.")


if __name__ == "__main__":
    main()

