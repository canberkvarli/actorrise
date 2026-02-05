"""
Verify that monologue search returns stable, deterministic results.

Runs the same search twice and asserts that result IDs and order match.
Use after enabling pgvector and backfilling embedding_vector.

Usage (from project root or backend directory):

    python backend/scripts/verify_search_stability.py
    # or from backend:
    uv run python scripts/verify_search_stability.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.services.search.semantic_search import SemanticSearch


def main() -> None:
    db = SessionLocal()
    try:
        search = SemanticSearch(db)
        query = "sad monologue"
        filters = {"category": "Classical"}
        limit = 10

        results_1 = search.search(query, limit=limit, filters=filters, user_id=None)
        results_2 = search.search(query, limit=limit, filters=filters, user_id=None)

        ids_1 = [m.id for m in results_1]
        ids_2 = [m.id for m in results_2]

        if ids_1 != ids_2:
            print("FAIL: Search is not stable. Same query returned different result order.")
            print("Run 1 IDs:", ids_1)
            print("Run 2 IDs:", ids_2)
            sys.exit(1)

        print(f"PASS: Search returned stable results ({len(ids_1)} IDs, same order across 2 runs).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
