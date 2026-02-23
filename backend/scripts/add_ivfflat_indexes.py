"""
Add IVFFlat indexes for 3072-dimensional embeddings.

IVFFlat is used instead of HNSW because HNSW has a 2000-dimension limit.
IVFFlat provides fast approximate nearest neighbor (ANN) search for high-dimensional vectors.

Usage (from backend directory):
    uv run python scripts/add_ivfflat_indexes.py

Safe to run multiple times (uses IF NOT EXISTS).
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

# Path must be set before app imports
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
# pylint: disable=wrong-import-position
from app.core.database import engine
# pylint: enable=wrong-import-position


def main() -> None:
    print("=" * 60)
    print("ADD IVFFLAT INDEXES FOR V2 EMBEDDINGS")
    print("=" * 60)
    print()
    print("IVFFlat is an approximate nearest neighbor (ANN) index")
    print("optimized for high-dimensional vectors (3072 dims).")
    print()
    print("Benefits:")
    print("  - 10-100x faster than sequential scan")
    print("  - Works with vectors > 2000 dimensions")
    print("  - Good recall/precision tradeoff")
    print()
    print("Adding indexes to:")
    print("  - monologues.embedding_vector (8,630 rows)")
    print("  - film_tv_references.embedding (14,256 rows)")
    print()

    # Check current row counts
    with engine.connect() as conn:
        mono_count = conn.execute(text("SELECT COUNT(*) FROM monologues")).scalar()
        film_count = conn.execute(text("SELECT COUNT(*) FROM film_tv_references")).scalar()
        print(f"Current counts:")
        print(f"  Monologues: {mono_count:,}")
        print(f"  Film/TV: {film_count:,}")
        print()

    # Calculate optimal lists parameter
    # Rule of thumb: lists = sqrt(row_count) for datasets < 1M rows
    mono_lists = max(10, int(mono_count ** 0.5))
    film_lists = max(10, int(film_count ** 0.5))

    print(f"Index parameters:")
    print(f"  Monologues: lists={mono_lists}")
    print(f"  Film/TV: lists={film_lists}")
    print()
    print("Note: Index creation may take 1-2 minutes...")
    print()

    statements = [
        # Increase memory for index creation (session-level only)
        text("SET maintenance_work_mem = '256MB';"),

        # Create IVFFlat index on monologues.embedding_vector
        text(f"""
            CREATE INDEX IF NOT EXISTS monologues_embedding_ivfflat_idx
            ON monologues
            USING ivfflat (embedding_vector vector_cosine_ops)
            WITH (lists = {mono_lists});
        """),

        # Create IVFFlat index on film_tv_references.embedding
        text(f"""
            CREATE INDEX IF NOT EXISTS film_tv_references_embedding_ivfflat_idx
            ON film_tv_references
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = {film_lists});
        """),

        # Reset memory (optional, will reset at session end anyway)
        text("RESET maintenance_work_mem;"),
    ]

    with engine.begin() as conn:
        for i, stmt in enumerate(statements, 1):
            stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
            print(f"[{i}/{len(statements)}] {stmt_preview}...")
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
    print("✅ IVFFLAT INDEXES CREATED")
    print("=" * 60)
    print()
    print("Search performance should now be 10-100x faster!")
    print()
    print("Verify with EXPLAIN ANALYZE:")
    print("  SELECT * FROM monologues")
    print("  ORDER BY embedding_vector <=> '[...]'::vector")
    print("  LIMIT 20;")
    print()
    print("Should show: 'Index Scan using monologues_embedding_ivfflat_idx'")
    print()


if __name__ == "__main__":
    main()
