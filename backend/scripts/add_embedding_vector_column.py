"""
One-time migration: enable pgvector and add embedding_vector to monologues.

Run this if you see:
    column monologues.embedding_vector does not exist

Usage (from backend directory):
    uv run python scripts/add_embedding_vector_column.py

Requirements:
    - PostgreSQL with pgvector package installed (e.g. apt install postgresql-16-pgvector).
    - Database connection via app config (DATABASE_URL).
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


def main() -> None:
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        conn.commit()
        print("  Extension: vector (pgvector) enabled.")

        conn.execute(
            text(
                "ALTER TABLE monologues ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);"
            )
        )
        conn.commit()
        print("  Column: monologues.embedding_vector added (if not present).")

    print("Done. You can run backfill_play_monologues and backfill_monologue_vectors.")


if __name__ == "__main__":
    main()
