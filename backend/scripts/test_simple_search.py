"""Simple test to see if search works at all."""
import sys
import logging
from pathlib import Path

# Enable debug logging
logging.basicConfig(level=logging.DEBUG)

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import SessionLocal
from app.services.search.semantic_search import SemanticSearch

db = SessionLocal()

queries = [
    "sad woman monologue",
    "Shakespeare tragedy",
    "funny male piece",
    "monologue about the creation of the world",
]

search = SemanticSearch(db)

for query in queries:
    print("\n" + "=" * 80)
    print(f"Query: '{query}'")
    print("=" * 80)

    try:
        results, match_types = search.search(query, limit=3)
        print(f"Results: {len(results)}")

        for i, (mono, score) in enumerate(results, 1):
            print(f"\n{i}. [{score:.4f}] {mono.title}")
            print(f"   Play: {mono.play.title if mono.play else 'Unknown'}")
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

db.close()
