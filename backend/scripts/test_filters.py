"""Test filter parsing and application."""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import SessionLocal
from app.services.search.semantic_search import SemanticSearch
from app.services.ai.content_analyzer import ContentAnalyzer

db = SessionLocal()
analyzer = ContentAnalyzer()

# Test query parsing
test_queries = [
    "funny piece for women",
    "funny piece for female",
    "2 minute monologue",
    "monologue under 2 minutes",
    "villain",
]

print("=" * 80)
print("QUERY PARSING TEST")
print("=" * 80)

for query in test_queries:
    parsed = analyzer.parse_search_query(query)
    print(f"\nQuery: '{query}'")
    print(f"Parsed: {parsed}")

# Test actual search with filters
print("\n\n" + "=" * 80)
print("SEARCH WITH FILTERS TEST")
print("=" * 80)

search = SemanticSearch(db)

# Test duration filter
print("\n\n1. Duration Filter Test:")
print("-" * 80)
results, _ = search.search("monologue", limit=5, filters={"max_duration": 120})  # 2 minutes = 120 seconds
print(f"Query: 'monologue' with max_duration=120 seconds")
print(f"Results: {len(results)}")
for mono, score in results:
    duration_min = mono.estimated_duration_seconds / 60
    print(f"  - {mono.title} ({duration_min:.1f} min, {mono.estimated_duration_seconds}s)")

# Test gender filter
print("\n\n2. Gender Filter Test:")
print("-" * 80)
results, _ = search.search("funny piece", limit=5, filters={"gender": "female"})
print(f"Query: 'funny piece' with gender='female'")
print(f"Results: {len(results)}")
for mono, score in results:
    print(f"  - {mono.title} - {mono.character_name} ({mono.character_gender})")

# Test natural language gender
print("\n\n3. Natural Language Gender Test:")
print("-" * 80)
results, _ = search.search("funny piece for women", limit=5)
print(f"Query: 'funny piece for women' (no explicit filter)")
print(f"Results: {len(results)}")
for mono, score in results:
    print(f"  - {mono.title} - {mono.character_name} ({mono.character_gender})")

db.close()
