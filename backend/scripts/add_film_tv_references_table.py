"""
Migration: Add film_tv_references table for IMDb/OMDb-enriched film and TV metadata.

The table stores one row per IMDb title (movie or tvSeries) and is used for
semantic film/TV search via pgvector cosine similarity.

Usage (from backend directory):
    uv run python scripts/add_film_tv_references_table.py

Safe to run multiple times (uses IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS).
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    text("CREATE EXTENSION IF NOT EXISTS vector;"),

    text("""
        CREATE TABLE IF NOT EXISTS film_tv_references (
            id              SERIAL PRIMARY KEY,
            title           VARCHAR NOT NULL,
            year            INTEGER,
            type            VARCHAR,
            genre           VARCHAR[],
            plot            TEXT,
            director        VARCHAR,
            actors          VARCHAR[],
            runtime_minutes INTEGER,
            imdb_id         VARCHAR NOT NULL,
            imdb_rating     FLOAT,
            poster_url      VARCHAR,
            imsdb_url       VARCHAR,
            embedding       vector(1536),
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """),

    # Unique constraint on imdb_id to prevent duplicates
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS film_tv_references_imdb_id_idx "
        "ON film_tv_references (imdb_id)"
    ),

    text("CREATE INDEX IF NOT EXISTS film_tv_references_type_idx ON film_tv_references (type)"),
    text("CREATE INDEX IF NOT EXISTS film_tv_references_year_idx ON film_tv_references (year)"),
    text("CREATE INDEX IF NOT EXISTS film_tv_references_imdb_rating_idx ON film_tv_references (imdb_rating)"),
    text("CREATE INDEX IF NOT EXISTS film_tv_references_director_idx ON film_tv_references (director)"),

    # HNSW index for fast cosine similarity search
    text(
        "CREATE INDEX IF NOT EXISTS film_tv_references_embedding_hnsw_idx "
        "ON film_tv_references "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64) "
        "WHERE embedding IS NOT NULL"
    ),
]


def main() -> None:
    print("=" * 60)
    print("FILM/TV REFERENCES TABLE MIGRATION")
    print("=" * 60)
    print()
    print("Adding:")
    print("  - film_tv_references table (IMDb/OMDb metadata)")
    print("  - Unique index on imdb_id")
    print("  - Scalar indexes (type, year, imdb_rating, director)")
    print("  - HNSW vector index for semantic search")
    print()

    with engine.begin() as conn:
        for i, stmt in enumerate(STATEMENTS, 1):
            stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
            print(f"[{i}/{len(STATEMENTS)}] {stmt_preview}...")
            try:
                conn.execute(stmt)
                print("  ✓ Success")
            except Exception as e:
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err:
                    print("  → Already exists (skipping)")
                else:
                    print(f"  ✗ Error: {e}")
                    raise
            print()

    print("=" * 60)
    print("✅ FILM/TV REFERENCES MIGRATION COMPLETE")
    print("=" * 60)
    print()
    print("Next: Run seed_film_tv_references.py to populate with IMDb/OMDb data.")
    print()


if __name__ == "__main__":
    main()
