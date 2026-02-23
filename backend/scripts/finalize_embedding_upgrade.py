"""
FINALIZE EMBEDDING UPGRADE: Swap old and new embedding columns.

⚠️  WARNING: This is a DESTRUCTIVE operation that modifies production tables.
    Only run this after:
    1. Running add_embedding_vector_v2.py
    2. Running backfill_enriched_embeddings.py
    3. Testing search quality with v2 embeddings
    4. Verifying all monologues have v2 embeddings populated

This script:
1. Verifies v2 embeddings are fully populated
2. Drops old HNSW indexes
3. Renames embedding_vector_v2 → embedding_vector_new
4. Renames embedding_vector → embedding_vector_deprecated
5. Renames embedding_vector_new → embedding_vector
6. Creates new HNSW indexes on embedding_vector (3072 dims, cosine)
7. Cleans up deprecated columns (optional)

Usage (from backend directory):
    # Dry run (show what would happen)
    uv run python scripts/finalize_embedding_upgrade.py --dry-run

    # Execute the swap (requires confirmation)
    uv run python scripts/finalize_embedding_upgrade.py

    # Skip cleanup of deprecated columns
    uv run python scripts/finalize_embedding_upgrade.py --no-cleanup
"""
from __future__ import annotations

import argparse
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


def check_v2_coverage(conn) -> tuple[int, int]:
    """
    Check how many monologues have v2 embeddings.

    Returns:
        (total_count, v2_count) tuple
    """
    total_query = text("SELECT COUNT(*) FROM monologues")
    total = conn.execute(total_query).scalar()

    v2_query = text("SELECT COUNT(*) FROM monologues WHERE embedding_vector_v2 IS NOT NULL")
    v2_count = conn.execute(v2_query).scalar()

    return total, v2_count


def check_film_tv_v2_coverage(conn) -> tuple[int, int]:
    """
    Check how many film_tv_references have v2 embeddings.

    Returns:
        (total_count, v2_count) tuple
    """
    total_query = text("SELECT COUNT(*) FROM film_tv_references")
    total = conn.execute(total_query).scalar()

    v2_query = text("SELECT COUNT(*) FROM film_tv_references WHERE embedding_vector_v2 IS NOT NULL")
    v2_count = conn.execute(v2_query).scalar()

    return total, v2_count


def print_dry_run_steps():
    """Print what the script would do."""
    print("\n" + "=" * 60)
    print("DRY RUN - Steps that would be executed:")
    print("=" * 60)
    print()
    print("MONOLOGUES TABLE:")
    print("  1. Drop old HNSW index on embedding_vector (1536 dims)")
    print("  2. Rename embedding_vector_v2 → embedding_vector_new")
    print("  3. Rename embedding_vector → embedding_vector_deprecated")
    print("  4. Rename embedding_vector_new → embedding_vector")
    print("  5. Create HNSW index on embedding_vector (3072 dims, cosine)")
    print("  6. [Optional] Drop embedding_vector_deprecated column")
    print()
    print("FILM_TV_REFERENCES TABLE:")
    print("  1. Drop old HNSW index on embedding (1536 dims)")
    print("  2. Rename embedding_vector_v2 → embedding_new")
    print("  3. Rename embedding → embedding_deprecated")
    print("  4. Rename embedding_new → embedding")
    print("  5. Create HNSW index on embedding (3072 dims, cosine)")
    print("  6. [Optional] Drop embedding_deprecated column")
    print()
    print("=" * 60)
    print()


def finalize_monologues_table(conn, cleanup: bool = False):
    """Execute the column swap for monologues table."""
    print("\n" + "=" * 60)
    print("FINALIZING MONOLOGUES TABLE")
    print("=" * 60)
    print()

    statements = [
        # Drop old HNSW index (if exists)
        text("""
            DROP INDEX IF EXISTS monologues_embedding_vector_hnsw_idx;
        """),

        # Step 1: Rename v2 to temp name
        text("""
            ALTER TABLE monologues
            RENAME COLUMN embedding_vector_v2 TO embedding_vector_new;
        """),

        # Step 2: Rename old to deprecated
        text("""
            ALTER TABLE monologues
            RENAME COLUMN embedding_vector TO embedding_vector_deprecated;
        """),

        # Step 3: Rename temp to final name
        text("""
            ALTER TABLE monologues
            RENAME COLUMN embedding_vector_new TO embedding_vector;
        """),

        # Step 4: Create new HNSW index (3072 dims, cosine)
        text("""
            CREATE INDEX IF NOT EXISTS monologues_embedding_vector_hnsw_idx
            ON monologues
            USING hnsw (embedding_vector vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
            WHERE embedding_vector IS NOT NULL;
        """),
    ]

    if cleanup:
        statements.append(
            text("ALTER TABLE monologues DROP COLUMN IF EXISTS embedding_vector_deprecated;")
        )

    for i, stmt in enumerate(statements, 1):
        stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
        print(f"[{i}/{len(statements)}] {stmt_preview}...")
        try:
            conn.execute(stmt)
            print("  ✓ Success")
        except DatabaseError as e:
            print(f"  ✗ Error: {e}")
            raise
        print()

    print("✓ Monologues table finalized")


def finalize_film_tv_table(conn, cleanup: bool = False):
    """Execute the column swap for film_tv_references table."""
    print("\n" + "=" * 60)
    print("FINALIZING FILM_TV_REFERENCES TABLE")
    print("=" * 60)
    print()

    statements = [
        # Drop old HNSW index (if exists) - film_tv_references uses 'embedding' column
        text("""
            DROP INDEX IF EXISTS film_tv_references_embedding_idx;
        """),

        # Step 1: Rename v2 to temp name
        text("""
            ALTER TABLE film_tv_references
            RENAME COLUMN embedding_vector_v2 TO embedding_new;
        """),

        # Step 2: Rename old to deprecated
        text("""
            ALTER TABLE film_tv_references
            RENAME COLUMN embedding TO embedding_deprecated;
        """),

        # Step 3: Rename temp to final name
        text("""
            ALTER TABLE film_tv_references
            RENAME COLUMN embedding_new TO embedding;
        """),

        # Step 4: Create new HNSW index (3072 dims, cosine)
        text("""
            CREATE INDEX IF NOT EXISTS film_tv_references_embedding_idx
            ON film_tv_references
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
            WHERE embedding IS NOT NULL;
        """),
    ]

    if cleanup:
        statements.append(
            text("ALTER TABLE film_tv_references DROP COLUMN IF EXISTS embedding_deprecated;")
        )

    for i, stmt in enumerate(statements, 1):
        stmt_preview = stmt.text.replace("\n", " ").strip()[:80]
        print(f"[{i}/{len(statements)}] {stmt_preview}...")
        try:
            conn.execute(stmt)
            print("  ✓ Success")
        except DatabaseError as e:
            print(f"  ✗ Error: {e}")
            raise
        print()

    print("✓ Film/TV references table finalized")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Finalize embedding upgrade by swapping v1 and v2 columns"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without executing"
    )
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Keep deprecated columns instead of dropping them"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("FINALIZE EMBEDDING UPGRADE")
    print("=" * 60)
    print()

    if args.dry_run:
        print_dry_run_steps()
        return

    # Check v2 coverage before proceeding
    with engine.connect() as conn:
        mono_total, mono_v2 = check_v2_coverage(conn)
        film_total, film_v2 = check_film_tv_v2_coverage(conn)

        print("COVERAGE CHECK:")
        print(f"  Monologues: {mono_v2}/{mono_total} have v2 embeddings ({100 * mono_v2 / max(mono_total, 1):.1f}%)")
        print(f"  Film/TV: {film_v2}/{film_total} have v2 embeddings ({100 * film_v2 / max(film_total, 1):.1f}%)")
        print()

        # Warn if coverage is not 100%
        if mono_v2 < mono_total:
            print(f"⚠️  WARNING: Only {mono_v2}/{mono_total} monologues have v2 embeddings!")
            print("   Run backfill_enriched_embeddings.py first to complete the migration.")
            print()

        if film_v2 < film_total:
            print(f"⚠️  WARNING: Only {film_v2}/{film_total} film/TV references have v2 embeddings!")
            print("   Run backfill_enriched_embeddings.py first to complete the migration.")
            print()

    # Confirm before proceeding
    print("⚠️  THIS IS A DESTRUCTIVE OPERATION")
    print("   This will swap the old and new embedding columns.")
    print("   Make sure you have:")
    print("     1. Tested search quality with v2 embeddings")
    print("     2. Backed up your database")
    print("     3. Verified v2 embeddings are fully populated")
    print()

    if not args.no_cleanup:
        print("   Deprecated columns will be DROPPED after the swap.")
        print()

    response = input("Type 'YES' to proceed: ")
    if response != "YES":
        print("\n❌ Aborted by user")
        sys.exit(0)

    print("\n🚀 Starting finalization...")

    # Execute the swap
    with engine.begin() as conn:
        finalize_monologues_table(conn, cleanup=not args.no_cleanup)
        finalize_film_tv_table(conn, cleanup=not args.no_cleanup)

    print("\n" + "=" * 60)
    print("✅ EMBEDDING UPGRADE FINALIZED")
    print("=" * 60)
    print()
    print("The embedding columns have been swapped:")
    print("  - monologues.embedding_vector now uses 3072 dims")
    print("  - film_tv_references.embedding now uses 3072 dims")
    print()
    print("Search will now use text-embedding-3-large with enriched metadata.")
    print()

    if args.no_cleanup:
        print("Deprecated columns kept:")
        print("  - monologues.embedding_vector_deprecated")
        print("  - film_tv_references.embedding_deprecated")
        print()
        print("You can manually drop these later with:")
        print("  ALTER TABLE monologues DROP COLUMN embedding_vector_deprecated;")
        print("  ALTER TABLE film_tv_references DROP COLUMN embedding_deprecated;")
        print()


if __name__ == "__main__":
    main()
