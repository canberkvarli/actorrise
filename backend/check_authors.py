#!/usr/bin/env python3
"""Quick script to check author distribution in database."""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

# Import using same approach as the app
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
db = SessionLocal()

try:
    # Get total counts
    total_monologues = db.query(Monologue).count()
    total_with_embeddings = db.query(Monologue).filter(
        Monologue.embedding.isnot(None)
    ).count()

    print(f"\n{'='*60}")
    print(f"DATABASE STATISTICS")
    print(f"{'='*60}")
    print(f"Total monologues: {total_monologues}")
    print(f"With embeddings: {total_with_embeddings} ({total_with_embeddings/total_monologues*100:.1f}%)" if total_monologues > 0 else "N/A")

    # Get author distribution
    author_counts = db.query(
        Play.author,
        func.count(Monologue.id).label('monologue_count'),
        func.count(Monologue.embedding).label('with_embedding')
    ).join(
        Monologue, Monologue.play_id == Play.id
    ).group_by(
        Play.author
    ).order_by(
        func.count(Monologue.id).desc()
    ).all()

    print(f"\n{'='*60}")
    print(f"MONOLOGUES BY AUTHOR")
    print(f"{'='*60}")
    print(f"{'Author':<30} {'Count':>8} {'w/Embed':>10} {'%':>6}")
    print(f"{'-'*60}")

    for author, count, with_emb in author_counts:
        pct = (with_emb / count * 100) if count > 0 else 0
        print(f"{author:<30} {count:>8} {with_emb:>10} {pct:>5.1f}%")

    print(f"{'='*60}\n")

finally:
    db.close()
