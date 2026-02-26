"""
Drop deprecated embedding columns to reduce database size.

Removes:
- monologues.embedding (legacy JSON text ~300KB+ per row)
- monologues.embedding_vector_deprecated (old 1536-dim pgvector column)
- monologues.embedding_vector_v2 (staging column, already swapped to embedding_vector)

The production column 'embedding_vector' (3072-dim pgvector) is kept.

Run: python backend/scripts/drop_deprecated_embedding_columns.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from sqlalchemy import text


def drop_columns():
    db = SessionLocal()
    try:
        # Check current DB size before
        result = db.execute(text(
            "SELECT pg_size_pretty(pg_total_relation_size('monologues')) as size"
        )).fetchone()
        print(f"Monologues table size BEFORE: {result[0]}")

        # Check which columns exist before dropping
        existing = db.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'monologues'
            AND column_name IN ('embedding', 'embedding_vector_deprecated', 'embedding_vector_v2')
        """)).fetchall()
        existing_cols = [r[0] for r in existing]
        print(f"Columns to drop (exist): {existing_cols}")

        if not existing_cols:
            print("No deprecated columns found. Nothing to do.")
            return

        # Drop each column if it exists
        for col in ['embedding', 'embedding_vector_deprecated', 'embedding_vector_v2']:
            if col in existing_cols:
                print(f"Dropping monologues.{col}...")
                db.execute(text(f"ALTER TABLE monologues DROP COLUMN IF EXISTS {col}"))
                print(f"  Dropped {col}")

        # Also drop embedding_vector_v2 from film_tv_references if it exists
        film_v2 = db.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'film_tv_references'
            AND column_name = 'embedding_vector_v2'
        """)).fetchall()
        if film_v2:
            print("Dropping film_tv_references.embedding_vector_v2...")
            db.execute(text(
                "ALTER TABLE film_tv_references DROP COLUMN IF EXISTS embedding_vector_v2"
            ))
            print("  Dropped film_tv_references.embedding_vector_v2")

        db.commit()
        print("\nAll deprecated columns dropped successfully.")

        # Check size after
        result = db.execute(text(
            "SELECT pg_size_pretty(pg_total_relation_size('monologues')) as size"
        )).fetchone()
        print(f"Monologues table size AFTER: {result[0]}")

        # Run VACUUM to reclaim space (note: VACUUM cannot run inside a transaction)
        print("\nRunning VACUUM to mark space as reusable...")
        db.close()

        # VACUUM needs autocommit
        from sqlalchemy import create_engine
        from app.core.config import settings
        engine = create_engine(settings.database_url)
        with engine.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT")
            # Use regular VACUUM (not FULL) — FULL needs more maintenance_work_mem
            # than Supabase free plan allows. Regular VACUUM marks space reusable.
            conn.execute(text("VACUUM monologues"))
            conn.execute(text("VACUUM film_tv_references"))

        print("VACUUM complete.")

        # Final size check
        db2 = SessionLocal()
        result = db2.execute(text(
            "SELECT pg_size_pretty(pg_total_relation_size('monologues')) as size"
        )).fetchone()
        print(f"Monologues table size FINAL: {result[0]}")
        db2.close()

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("=" * 60)
    print("Dropping deprecated embedding columns")
    print("=" * 60)
    drop_columns()
