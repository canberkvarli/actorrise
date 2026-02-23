"""
Migration: Add embedding_vector_v2 (vector 3072) columns for upgraded embeddings.

Adds:
1. embedding_vector_v2 (vector(3072)) to monologues table
2. embedding_vector_v2 (vector(3072)) to film_tv_references table

This is part of the upgrade from text-embedding-3-small (1536 dims) to
text-embedding-3-large (3072 dims) with enriched metadata.

Usage (from backend directory):
    uv run python scripts/add_embedding_vector_v2.py

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

    # Add embedding_vector_v2 column to monologues table
    text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'monologues'
                AND column_name = 'embedding_vector_v2'
            ) THEN
                ALTER TABLE monologues
                ADD COLUMN embedding_vector_v2 vector(3072);
            END IF;
        END $$;
    """),

    # Add embedding_vector_v2 column to film_tv_references table
    text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'film_tv_references'
                AND column_name = 'embedding_vector_v2'
            ) THEN
                ALTER TABLE film_tv_references
                ADD COLUMN embedding_vector_v2 vector(3072);
            END IF;
        END $$;
    """),
]


def main() -> None:
    print("=" * 60)
    print("EMBEDDING VECTOR V2 MIGRATION")
    print("=" * 60)
    print()
    print("Adding:")
    print("  - embedding_vector_v2 (vector 3072) to monologues")
    print("  - embedding_vector_v2 (vector 3072) to film_tv_references")
    print()
    print("This supports the upgrade from text-embedding-3-small (1536)")
    print("to text-embedding-3-large (3072) with enriched metadata.")
    print()

    with engine.begin() as conn:
        for i, stmt in enumerate(STATEMENTS, 1):
            stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
            print(f"[{i}/{len(STATEMENTS)}] {stmt_preview}...")
            try:
                conn.execute(stmt)
                print("  ✓ Success")
            except DatabaseError as e:
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err:
                    print("  → Already exists (skipping)")
                else:
                    print(f"  ✗ Error: {e}")
                    raise
            print()

    print("=" * 60)
    print("✅ EMBEDDING VECTOR V2 MIGRATION COMPLETE")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Run backfill_enriched_embeddings.py to populate v2 embeddings")
    print("  2. Update semantic_search.py to use v2 when available")
    print("  3. Run finalize_embedding_upgrade.py to swap columns")
    print()


if __name__ == "__main__":
    main()
