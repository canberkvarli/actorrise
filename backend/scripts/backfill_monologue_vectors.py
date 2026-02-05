"""
Backfill script to migrate existing JSON/text embeddings into the pgvector column.

Usage (from project root or backend directory):

    python backend/scripts/backfill_monologue_vectors.py
    # or from backend:
    uv run python scripts/backfill_monologue_vectors.py

Requirements:
    - PostgreSQL database with the `pgvector` extension enabled:
        CREATE EXTENSION IF NOT EXISTS vector;
    - The `embedding_vector` column added to monologues (e.g. via migration).
    - The `pgvector` Python package installed (see pyproject.toml).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue


def parse_embedding(raw: str) -> List[float] | None:
    """Parse legacy JSON/text embedding into a list[float]."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            # Ensure all values are floats
            return [float(x) for x in data]
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
    return None


def backfill_batch(batch_size: int = 500) -> int:
    """Backfill embeddings in batches. Returns number of rows updated."""
    updated = 0
    db = SessionLocal()
    try:
        while True:
            # Select monologues that have a legacy embedding but no vector yet.
            batch = (
                db.query(Monologue)
                .filter(Monologue.embedding.isnot(None))
                .filter(Monologue.embedding != "")
                .filter(Monologue.embedding_vector.is_(None))
                .limit(batch_size)
                .all()
            )

            if not batch:
                break

            for mono in batch:
                vec = parse_embedding(mono.embedding)  # type: ignore[arg-type]
                if vec:
                    mono.embedding_vector = vec  # pgvector will coerce the Python list
                    updated += 1

            db.commit()

    finally:
        db.close()

    return updated


def main() -> None:
    updated = backfill_batch()
    print(f"Backfill complete. Updated {updated} monologues.")


if __name__ == "__main__":
    main()

