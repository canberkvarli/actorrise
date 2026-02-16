"""
Create full-text search indexes for comprehensive monologue search.

Adds GIN indexes to enable searching on previously unused fields:
- character_description
- context_before
- context_after
- scene_description
- search_tags (array)

Usage:
    uv run python scripts/create_full_text_search_indexes.py

Safe to run multiple times.
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine


STATEMENTS = [
    # 1. Full-text search index combining unused text fields
    # This enables searching character descriptions, context, and scene info
    text(
        "CREATE INDEX IF NOT EXISTS idx_monologues_full_text_search "
        "ON monologues "
        "USING gin(to_tsvector('english', "
        "  coalesce(text, '') || ' ' || "
        "  coalesce(character_description, '') || ' ' || "
        "  coalesce(context_before, '') || ' ' || "
        "  coalesce(context_after, '') || ' ' || "
        "  coalesce(scene_description, '')"
        "))"
    ),

    # 2. GIN index for search_tags array
    # Enables fast array overlap queries (tags @> '{theme1, theme2}')
    text(
        "CREATE INDEX IF NOT EXISTS idx_monologues_search_tags_gin "
        "ON monologues "
        "USING gin(search_tags)"
    ),
]


def main() -> None:
    print("Creating full-text search indexes for comprehensive search...")
    print("This enables searching on character descriptions, context, and scenes.\n")

    with engine.begin() as conn:
        for i, stmt in enumerate(STATEMENTS, 1):
            print(f"[{i}/{len(STATEMENTS)}] Executing: {stmt.text[:80]}...")
            try:
                conn.execute(stmt)
                print(f"  ✓ Success\n")
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"  → Index already exists (skipping)\n")
                else:
                    print(f"  ✗ Error: {e}\n")
                    raise

    print("=" * 60)
    print("✓ Full-text search indexes created successfully!")
    print("=" * 60)
    print("\nSearchable fields now include:")
    print("  - Monologue text (existing)")
    print("  - Character name (existing)")
    print("  - Character description (NEW)")
    print("  - Scene description (NEW)")
    print("  - Context before/after (NEW)")
    print("  - Search tags array (NEW)")
    print("\nUsers can now search for:")
    print("  - Character traits: 'ambitious lawyer'")
    print("  - Scene context: 'in a garden at night'")
    print("  - Situations: 'confrontation with father'")


if __name__ == "__main__":
    main()
