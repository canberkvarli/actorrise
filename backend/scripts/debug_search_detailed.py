"""Debug script to see actual relevance scores."""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
load_dotenv()

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.ai.langchain.embeddings import generate_embedding
from sqlalchemy import text
import numpy as np

db = SessionLocal()

# Generate query embedding
query = "monologue about the creation of the world"
print(f"Generating embedding for: '{query}'")
query_embedding = generate_embedding(query, model="text-embedding-3-large", dimensions=3072)
print(f"Query embedding dimensions: {len(query_embedding)}")

# Get top 20 monologues by cosine similarity (ignoring threshold)
print("\nFetching top 20 matches (raw scores)...")
similarity_query = text("""
    SELECT
        id,
        title,
        character_name,
        1 - (embedding_vector_v2 <=> :embedding) as similarity
    FROM monologues
    WHERE embedding_vector_v2 IS NOT NULL
    ORDER BY embedding_vector_v2 <=> :embedding
    LIMIT 20
""")

results = db.execute(similarity_query, {"embedding": query_embedding}).fetchall()

print("\nTop 20 matches:")
print("-" * 80)
for i, (mono_id, title, character, similarity) in enumerate(results, 1):
    print(f"{i:2}. [{similarity:.4f}] {title[:50]}")
    print(f"    Character: {character}")

    # Fetch full monologue to check themes
    mono = db.query(Monologue).filter(Monologue.id == mono_id).first()
    if mono:
        if mono.themes:
            print(f"    Themes: {', '.join(mono.themes[:5])}")
        if mono.primary_emotion:
            print(f"    Emotion: {mono.primary_emotion}")
        if mono.play:
            print(f"    Play: {mono.play.title} by {mono.play.author}")
        # Show first 150 chars of text
        if mono.text:
            text_preview = mono.text[:150].replace('\n', ' ')
            print(f"    Text: {text_preview}...")
    print()

# Check keyword matches
print("\n" + "=" * 80)
print("Checking for keyword matches (creation, world, genesis)...")
print("=" * 80)

keyword_query = db.query(Monologue).join(Play).filter(
    Monologue.text.ilike('%creation%') |
    Monologue.text.ilike('%genesis%') |
    Monologue.themes.any('creation')
).limit(5)

keyword_results = keyword_query.all()
print(f"\nFound {len(keyword_results)} keyword matches")
for mono in keyword_results:
    print(f"\n- {mono.title}")
    print(f"  Character: {mono.character_name}")
    print(f"  Play: {mono.play.title if mono.play else 'Unknown'}")
    print(f"  Themes: {', '.join(mono.themes) if mono.themes else 'None'}")

db.close()

print("\n" + "=" * 80)
print("THRESHOLD INFO:")
print("=" * 80)
print("Current MIN_RELEVANCE_TO_SHOW: 0.48")
print("If best score is below 0.48, search returns empty results.")
print("\nConsider lowering threshold if valid matches have scores < 0.48")
