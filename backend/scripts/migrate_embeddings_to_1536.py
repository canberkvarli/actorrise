#!/usr/bin/env python3
"""
Migrate monologue embeddings from 3072 to 1536 dimensions.

This enables pgvector HNSW indexing (max 2000 dims).
Searches will go from 35 seconds → <1 second.

Affects: plays AND film/TV monologues (all in monologues table)

Usage:
    DATABASE_URL='...' python scripts/migrate_embeddings_to_1536.py

Cost estimate: ~$0.08 for ~7,500 monologues
Time estimate: ~15-20 minutes
"""

import os
import sys
import time

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configuration
NEW_DIMS = 1536
BATCH_SIZE = 50
MODEL = "text-embedding-3-large"


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: Set DATABASE_URL environment variable")
        sys.exit(1)

    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)

    print("=" * 60)
    print("EMBEDDING MIGRATION: 3072 → 1536 dimensions")
    print("=" * 60)

    # Step 1: Check current state
    with engine.connect() as conn:
        # Count by source type
        result = conn.execute(text("""
            SELECT p.source_type, COUNT(*) as total,
                   SUM(CASE WHEN m.embedding_vector IS NOT NULL THEN 1 ELSE 0 END) as with_emb
            FROM monologues m
            JOIN plays p ON m.play_id = p.id
            GROUP BY p.source_type
        """))
        print("\nCurrent monologues:")
        for row in result.fetchall():
            print(f"  {row[0]}: {row[1]} total, {row[2]} with embeddings")

        # Check dimensions
        dims = conn.execute(text("""
            SELECT vector_dims(embedding_vector)
            FROM monologues WHERE embedding_vector IS NOT NULL LIMIT 1
        """)).scalar()
        print(f"\nCurrent dimensions: {dims}")

        if dims == NEW_DIMS:
            print("\n✅ Already at 1536 dimensions!")
            print("Just need to create/verify HNSW index...")
            _create_index(engine)
            return

        # Check for invalid index
        invalid_idx = conn.execute(text("""
            SELECT indexrelid::regclass
            FROM pg_index
            WHERE indexrelid::regclass::text LIKE '%embedding%hnsw%'
            AND NOT indisvalid
        """)).fetchall()
        if invalid_idx:
            print(f"\n⚠️  Found invalid index: {invalid_idx[0][0]}")

    # Step 2: Drop invalid index
    print("\nStep 1/4: Dropping invalid HNSW index...")
    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_monologues_embedding_vector_hnsw"))
    print("  Done.")

    # Step 3: Alter column to 1536 dimensions
    print(f"\nStep 2/4: Altering column to Vector({NEW_DIMS})...")
    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text("UPDATE monologues SET embedding_vector = NULL"))
        conn.execute(text(f"ALTER TABLE monologues ALTER COLUMN embedding_vector TYPE vector({NEW_DIMS})"))
    print("  Done.")

    # Step 4: Regenerate embeddings
    print(f"\nStep 3/4: Regenerating embeddings at {NEW_DIMS} dimensions...")

    from app.services.ai.langchain.embeddings import generate_embedding
    from app.services.ai.embedding_text_builder import build_monologue_enriched_text
    from app.models.actor import Monologue, Play

    session = Session()

    try:
        monologues = session.query(Monologue).join(Play).all()
        total = len(monologues)
        print(f"  Processing {total} monologues...")

        start_time = time.time()
        success = 0
        errors = 0

        for i, mono in enumerate(monologues):
            try:
                # Build enriched text (pass monologue object directly)
                enriched_text = build_monologue_enriched_text(mono)

                # Generate embedding
                embedding = generate_embedding(
                    enriched_text,
                    model=MODEL,
                    dimensions=NEW_DIMS,
                )

                if embedding and len(embedding) == NEW_DIMS:
                    mono.embedding_vector = embedding
                    success += 1
                else:
                    errors += 1

                # Progress update every batch
                if (i + 1) % BATCH_SIZE == 0:
                    session.commit()
                    elapsed = time.time() - start_time
                    rate = (i + 1) / elapsed
                    remaining = (total - i - 1) / rate if rate > 0 else 0
                    print(f"  Progress: {i + 1}/{total} ({success} ok, {errors} err) - {remaining:.0f}s remaining")

            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  ❌ Error on {mono.id}: {e}")

        session.commit()
        elapsed = time.time() - start_time
        print(f"\n  Completed: {success}/{total} embeddings in {elapsed:.1f}s")
        if errors:
            print(f"  Errors: {errors}")

    finally:
        session.close()

    # Step 5: Create HNSW index
    print(f"\nStep 4/4: Creating HNSW index...")
    _create_index(engine)

    print("\n" + "=" * 60)
    print("✅ MIGRATION COMPLETE!")
    print("=" * 60)
    print("Both play AND film/TV monologue searches are now fast (<1s)")


def _create_index(engine):
    """Create HNSW index on monologues.embedding_vector."""
    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text("DROP INDEX IF EXISTS ix_monologues_embedding_vector_hnsw"))
        print("  Creating HNSW index (may take 1-2 minutes)...")
        conn.execute(text("""
            CREATE INDEX CONCURRENTLY ix_monologues_embedding_vector_hnsw
            ON monologues
            USING hnsw (embedding_vector vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
        """))

    # Verify
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT indexrelid::regclass, indisvalid
            FROM pg_index
            WHERE indexrelid::regclass::text LIKE '%embedding%hnsw%'
        """))
        row = result.fetchone()
        if row and row[1]:
            print(f"  ✅ Index created and valid: {row[0]}")
        else:
            print("  ⚠️  Index creation may have failed")


if __name__ == "__main__":
    main()
