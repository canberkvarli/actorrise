"""
Migration: Add film/TV monologue reference tables (metadata-only, no script text).

Adds:
1. film_tv_sources: title, type (film/tv_series), year, director, studio, genre[], imdb_id
2. film_tv_monologues: character, description, themes, embedding (vector 1536), script_url, etc.
3. HNSW index on film_tv_monologues.embedding for semantic search

Usage (from backend directory):
    uv run python scripts/add_film_tv_tables.py

Safe to run multiple times (uses IF NOT EXISTS).
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

# Path must be set before app imports (script run from repo root or backend).
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
# pylint: disable=wrong-import-position
from app.core.database import engine
# pylint: enable=wrong-import-position


STATEMENTS = [
    text("CREATE EXTENSION IF NOT EXISTS vector;"),

    text("""
        CREATE TABLE IF NOT EXISTS film_tv_sources (
            id SERIAL PRIMARY KEY,
            title VARCHAR NOT NULL,
            type VARCHAR,
            year INTEGER,
            director VARCHAR,
            studio VARCHAR,
            genre VARCHAR[],
            imdb_id VARCHAR
        )
    """),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_sources_type "
        "ON film_tv_sources(type)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_sources_year "
        "ON film_tv_sources(year)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_sources_imdb_id "
        "ON film_tv_sources(imdb_id)"
    ),

    text("""
        CREATE TABLE IF NOT EXISTS film_tv_monologues (
            id SERIAL PRIMARY KEY,
            source_id INTEGER NOT NULL REFERENCES film_tv_sources(id) ON DELETE CASCADE,
            character_name VARCHAR NOT NULL,
            actor_name VARCHAR,
            description TEXT,
            themes VARCHAR[],
            primary_emotion VARCHAR,
            tone VARCHAR[],
            estimated_duration_seconds INTEGER,
            word_count_approx INTEGER,
            character_gender VARCHAR,
            character_age_range VARCHAR,
            difficulty_level VARCHAR,
            scene_description VARCHAR,
            timestamp_approx VARCHAR,
            script_url VARCHAR,
            youtube_url VARCHAR,
            embedding vector(1536),
            copyright_status VARCHAR DEFAULT 'copyrighted',
            content_hosted BOOLEAN NOT NULL DEFAULT FALSE
        )
    """),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_monologues_source_id "
        "ON film_tv_monologues(source_id)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_monologues_character_gender "
        "ON film_tv_monologues(character_gender)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_monologues_primary_emotion "
        "ON film_tv_monologues(primary_emotion)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_monologues_difficulty_level "
        "ON film_tv_monologues(difficulty_level)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS idx_film_tv_monologues_character_age_range "
        "ON film_tv_monologues(character_age_range)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS film_tv_monologues_embedding_hnsw_idx "
        "ON film_tv_monologues "
        "USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64) "
        "WHERE embedding IS NOT NULL"
    ),
]


def main() -> None:
    print("=" * 60)
    print("FILM/TV MONOLOGUE REFERENCE TABLES MIGRATION")
    print("=" * 60)
    print()
    print("Adding:")
    print("  - film_tv_sources table")
    print("  - film_tv_monologues table (metadata-only, embedding for search)")
    print("  - Indexes and HNSW vector index")
    print()

    with engine.begin() as conn:
        for i, stmt in enumerate(STATEMENTS, 1):
            stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
            print(f"[{i}/{len(STATEMENTS)}] {stmt_preview}...")
            try:
                conn.execute(stmt)
                print("  ✓ Success")
            except DatabaseError as e:  # pylint: disable=broad-exception-caught
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err:
                    print("  → Already exists (skipping)")
                else:
                    print(f"  ✗ Error: {e}")
                    raise
            print()

    print("=" * 60)
    print("✅ FILM/TV TABLES MIGRATION COMPLETE")
    print("=" * 60)
    print()
    print("Next: Run seed_film_tv_monologues.py to populate with reference data.")
    print()


if __name__ == "__main__":
    main()
