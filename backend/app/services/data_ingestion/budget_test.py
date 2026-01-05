"""Budget-friendly test script - costs less than $0.20!

This script:
1. Ingests just 2 Shakespeare plays (Hamlet + Romeo & Juliet)
2. Extracts ~50-100 monologues
3. Analyzes them with AI
4. Total cost: ~$0.10-0.16

Perfect for testing the full system without spending much!
"""

import sys
import os
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from app.core.database import SessionLocal
from app.services.data_ingestion.gutenberg_scraper import GutenbergScraper
from app.services.ai.batch_processor import BatchProcessor


# Test plays (just 2 for budget testing)
TEST_PLAYS = {
    "William Shakespeare": ["Hamlet", "Romeo and Juliet"]
}


async def run_budget_test():
    """Run a budget-friendly test of the monologue finder"""

    db = SessionLocal()

    try:
        print("\n" + "="*70)
        print("🎭 BUDGET-FRIENDLY MONOLOGUE FINDER TEST")
        print("="*70)
        print("\n💰 Estimated cost: $0.10 - $0.16")
        print("⏱️  Estimated time: 3-5 minutes")
        print("\nThis will:")
        print("  1. Ingest 2 Shakespeare plays (Hamlet + Romeo & Juliet)")
        print("  2. Extract ~50-100 monologues")
        print("  3. Analyze them with AI")
        print("  4. Generate embeddings for semantic search")
        print("\n" + "="*70 + "\n")

        confirm = input("Continue? (yes/no): ")
        if confirm.lower() not in ['yes', 'y']:
            print("Cancelled.")
            return

        # Step 1: Ingest plays
        print("\n📚 STEP 1: Ingesting Shakespeare plays...")
        print("="*70)

        scraper = GutenbergScraper(db)

        for author, plays in TEST_PLAYS.items():
            for play_title in plays:
                print(f"\n🔍 Searching for: {play_title}")
                results = scraper.search_plays(author, play_title)

                if not results:
                    print(f"  ❌ Not found: {play_title}")
                    continue

                book = results[0]
                book_id = book['id']

                scraper.ingest_play(
                    book_id=book_id,
                    play_title=play_title,
                    author=author,
                    genre="tragedy"
                )

        # Step 2: Count monologues
        from app.models.actor import Monologue, Play

        total_monologues = db.query(Monologue).join(Play).filter(
            Play.author == "William Shakespeare"
        ).count()

        print(f"\n✅ Ingestion complete!")
        print(f"   Total monologues extracted: {total_monologues}")

        # For budget test, limit to 100 monologues
        limit = min(total_monologues, 100)

        print(f"\n💰 For budget testing, we'll analyze only {limit} monologues")
        print(f"   Estimated cost: ${limit * 0.0016:.2f}")

        confirm2 = input(f"\nProceed with AI analysis of {limit} monologues? (yes/no): ")
        if confirm2.lower() not in ['yes', 'y']:
            print("Skipping AI analysis. You can run it later with:")
            print("  python -m app.services.ai.batch_processor --all")
            return

        # Step 3: AI Analysis
        print("\n🤖 STEP 2: AI Analysis...")
        print("="*70)

        # Get first N monologue IDs
        monologues = db.query(Monologue).join(Play).filter(
            Play.author == "William Shakespeare",
            Monologue.embedding.is_(None)
        ).limit(limit).all()

        monologue_ids = [m.id for m in monologues]

        processor = BatchProcessor(db)
        await processor.process_monologues(
            monologue_ids=monologue_ids,
            batch_size=5  # Smaller batches for budget test
        )

        # Step 4: Summary
        print("\n" + "="*70)
        print("✅ BUDGET TEST COMPLETE!")
        print("="*70)

        analyzed = db.query(Monologue).filter(
            Monologue.embedding.isnot(None)
        ).count()

        print(f"\n📊 Final Statistics:")
        print(f"   Plays ingested: 2")
        print(f"   Total monologues: {total_monologues}")
        print(f"   Analyzed monologues: {analyzed}")
        print(f"   Approximate cost: ${analyzed * 0.0016:.2f}")

        print(f"\n🎉 You can now test the monologue finder!")
        print(f"   Frontend: http://localhost:3000/search")
        print(f"   API: http://localhost:8000/docs")

        print(f"\n💡 Try these searches:")
        print(f"   - 'sad monologue about death'")
        print(f"   - 'romantic speech for young woman'")
        print(f"   - 'monologue about revenge'")

        print(f"\n📈 To expand later (analyze remaining monologues):")
        print(f"   cd backend")
        print(f"   uv run python -m app.services.ai.batch_processor --all")

        print("\n" + "="*70 + "\n")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        db.close()


if __name__ == "__main__":
    print("\n⚠️  Make sure you have:")
    print("  1. Started the FastAPI backend (uvicorn app.main:app --reload)")
    print("  2. Added OPENAI_API_KEY to backend/.env")
    print("  3. Installed dependencies (uv pip install -e .)")
    print()

    asyncio.run(run_budget_test())
