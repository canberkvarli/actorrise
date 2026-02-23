"""Quick debug script to test search and see what's happening."""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import SessionLocal
from app.services.search.semantic_search import SemanticSearch
from sqlalchemy import text

db = SessionLocal()

# Check v2 coverage
print("=" * 60)
print("V2 EMBEDDING COVERAGE")
print("=" * 60)

mono_query = text("""
    SELECT
        COUNT(*) as total,
        COUNT(embedding_vector_v2) as with_v2,
        COUNT(embedding_vector) as with_v1
    FROM monologues
""")
result = db.execute(mono_query).fetchone()
print(f"Monologues:")
print(f"  Total: {result[0]}")
print(f"  With v2 (3072): {result[1]}")
print(f"  With v1 (1536): {result[2]}")

film_query = text("""
    SELECT
        COUNT(*) as total,
        COUNT(embedding_vector_v2) as with_v2,
        COUNT(embedding) as with_v1
    FROM film_tv_references
""")
result = db.execute(film_query).fetchone()
print(f"\nFilm/TV References:")
print(f"  Total: {result[0]}")
print(f"  With v2 (3072): {result[1]}")
print(f"  With v1 (1536): {result[2]}")

# Test search
print("\n" + "=" * 60)
print("TESTING SEARCH")
print("=" * 60)

test_query = "monologue about the creation of the world"
print(f"\nQuery: '{test_query}'")

search = SemanticSearch(db)
results, match_types = search.search(test_query, limit=5)

print(f"\nResults: {len(results)} found")
for i, (mono, score) in enumerate(results[:5], 1):
    print(f"\n{i}. [{score:.3f}] {mono.title}")
    print(f"   Character: {mono.character_name}")
    print(f"   Play: {mono.play.title if mono.play else 'Unknown'}")
    print(f"   Themes: {', '.join(mono.themes[:3]) if mono.themes else 'None'}")
    print(f"   Text preview: {mono.text[:100]}...")

# Check if search is using v2
has_v2_query = text("SELECT COUNT(*) FROM monologues WHERE embedding_vector_v2 IS NOT NULL LIMIT 1")
has_v2 = db.execute(has_v2_query).scalar() > 0
print(f"\nIs v2 available? {has_v2}")

db.close()
