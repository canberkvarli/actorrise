"""Quick script to check what authors and monologues are in the database."""

import asyncio
from sqlalchemy import func, select
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play


def check_database():
    """Check what's in the database"""
    db = SessionLocal()

    try:
        # Count total monologues
        total_monologues = db.query(Monologue).count()
        print(f"\n📊 Total monologues: {total_monologues}")

        # Count total plays
        total_plays = db.query(Play).count()
        print(f"📚 Total plays: {total_plays}")

        # Count by author
        print("\n👤 Monologues by author:")
        author_counts = db.query(
            Play.author,
            func.count(Monologue.id).label('count')
        ).join(Monologue).group_by(Play.author).order_by(func.count(Monologue.id).desc()).all()

        for author, count in author_counts:
            print(f"  • {author}: {count} monologues")

        # Count by category
        print("\n🎭 Monologues by category:")
        category_counts = db.query(
            Play.category,
            func.count(Monologue.id).label('count')
        ).join(Monologue).group_by(Play.category).all()

        for category, count in category_counts:
            print(f"  • {category}: {count} monologues")

        # Check embeddings
        with_embeddings = db.query(Monologue).filter(Monologue.embedding.isnot(None)).count()
        without_embeddings = total_monologues - with_embeddings
        print(f"\n🔍 Embeddings:")
        print(f"  • With embeddings: {with_embeddings}")
        print(f"  • Without embeddings: {without_embeddings}")

        if without_embeddings > 0:
            print(f"\n⚠️  Warning: {without_embeddings} monologues don't have embeddings!")
            print("   These won't show up in semantic search.")
            print("   Run the budget test or full ingestion to generate embeddings.")

    finally:
        db.close()


if __name__ == "__main__":
    check_database()
