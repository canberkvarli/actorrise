"""
Backfill script: Generate enriched embeddings with text-embedding-3-large (3072 dims).

This script:
1. Builds enriched text from metadata for monologues and film_tv_references
2. Generates embeddings using text-embedding-3-large (3072 dims)
3. Stores them in embedding_vector_v2 columns
4. Processes in batches of 20 (OpenAI batch API)
5. Skips rows where embedding_vector_v2 already exists
6. Has retry logic with exponential backoff

Usage (from backend directory):
    # Backfill all tables
    uv run python scripts/backfill_enriched_embeddings.py

    # Backfill specific table
    uv run python scripts/backfill_enriched_embeddings.py --table monologues
    uv run python scripts/backfill_enriched_embeddings.py --table film_tv
    uv run python scripts/backfill_enriched_embeddings.py --table all
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import List, Tuple

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.orm import Session

# Path must be set before app imports
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv()

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.ai.langchain.embeddings import generate_embeddings_batch
# pylint: enable=wrong-import-position


BATCH_SIZE = 20  # OpenAI batch embedding API handles this well
PROGRESS_INTERVAL = 100  # Print progress every N rows
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # seconds


def build_monologue_enriched_text(mono: Monologue) -> str:
    """
    Build enriched text for a monologue embedding.

    Format:
    "{character_name} from {play_title} by {author}.
    Emotion: {primary_emotion}. Tone: {tone}.
    Gender: {character_gender}. Age: {character_age_range}.
    Themes: {themes joined by comma}.
    Difficulty: {difficulty_level}.
    {text[:800]}"
    """
    parts = []

    # Character and play info
    if mono.character_name:
        play_title = mono.play.title if mono.play else "Unknown Play"
        author = mono.play.author if mono.play else "Unknown Author"
        parts.append(f"{mono.character_name} from {play_title} by {author}.")

    # Metadata
    if mono.primary_emotion:
        parts.append(f"Emotion: {mono.primary_emotion}.")
    if mono.tone:
        parts.append(f"Tone: {mono.tone}.")
    if mono.character_gender:
        parts.append(f"Gender: {mono.character_gender}.")
    if mono.character_age_range:
        parts.append(f"Age: {mono.character_age_range}.")
    if mono.themes:
        themes_str = ", ".join(mono.themes)
        parts.append(f"Themes: {themes_str}.")
    if mono.difficulty_level:
        parts.append(f"Difficulty: {mono.difficulty_level}.")

    # Text snippet (first 800 chars)
    if mono.text:
        text_snippet = mono.text[:800]
        parts.append(text_snippet)

    return " ".join(parts)


def build_film_tv_enriched_text(db: Session, row_id: int) -> str:
    """
    Build enriched text for a film_tv_references embedding.

    Format:
    "{title} ({year}). Type: {type}. Genre: {genre}.
    Director: {director}. Actors: {actors}. {plot}"

    Note: film_tv_references uses FilmTvReference model.
    """
    from app.models.actor import FilmTvReference

    ref = db.query(FilmTvReference).filter(FilmTvReference.id == row_id).first()
    if not ref:
        return ""

    parts = []

    # Title and year
    if ref.title:
        year_str = f" ({ref.year})" if ref.year else ""
        parts.append(f"{ref.title}{year_str}.")

    # Type (movie/tvSeries)
    if ref.type:
        parts.append(f"Type: {ref.type}.")

    # Genre
    if ref.genre:
        if isinstance(ref.genre, list):
            genre_str = ", ".join(ref.genre)
        else:
            genre_str = str(ref.genre)
        parts.append(f"Genre: {genre_str}.")

    # Director
    if ref.director:
        parts.append(f"Director: {ref.director}.")

    # Actors
    if ref.actors:
        if isinstance(ref.actors, list):
            # Limit to first 5 actors to keep text concise
            actors_str = ", ".join(ref.actors[:5])
        else:
            actors_str = str(ref.actors)
        parts.append(f"Actors: {actors_str}.")

    # Plot (truncate to 500 chars to keep embedding focused)
    if ref.plot:
        plot_snippet = ref.plot[:500]
        parts.append(plot_snippet)

    return " ".join(parts)


def backfill_monologues(db: Session) -> None:
    """Backfill enriched embeddings for monologues table."""
    print("\n" + "=" * 60)
    print("BACKFILLING MONOLOGUES")
    print("=" * 60)

    # Count total rows that need embeddings
    total_query = text("""
        SELECT COUNT(*)
        FROM monologues
        WHERE embedding_vector_v2 IS NULL
    """)
    total = db.execute(total_query).scalar()
    print(f"Total monologues to process: {total}")

    if total == 0:
        print("✓ All monologues already have v2 embeddings!")
        return

    # Fetch rows in batches
    processed = 0
    errors = 0

    while processed < total:
        # Get batch of monologues (no offset - the NULL filter naturally gets the next batch)
        batch_query = db.query(Monologue).join(Play).filter(
            Monologue.embedding_vector_v2.is_(None)
        ).order_by(Monologue.id).limit(BATCH_SIZE)

        batch = batch_query.all()
        if not batch:
            break

        # Build enriched texts
        enriched_texts = [build_monologue_enriched_text(mono) for mono in batch]
        ids = [mono.id for mono in batch]

        # Generate embeddings with retry logic
        embeddings = None
        for attempt in range(MAX_RETRIES):
            try:
                embeddings = generate_embeddings_batch(
                    texts=enriched_texts,
                    model="text-embedding-3-large",
                    dimensions=3072,
                )
                break  # Success
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    print(f"  ⚠ Rate limit hit, retrying in {backoff}s... (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(backoff)
                else:
                    print(f"  ✗ Error generating embeddings after {MAX_RETRIES} attempts: {e}")
                    errors += len(batch)
                    break

        if not embeddings:
            continue

        # Update database
        for mono_id, embedding in zip(ids, embeddings):
            if embedding:  # Skip empty embeddings
                try:
                    update_query = text("""
                        UPDATE monologues
                        SET embedding_vector_v2 = :embedding
                        WHERE id = :id
                    """)
                    db.execute(update_query, {"embedding": embedding, "id": mono_id})
                    processed += 1
                except Exception as e:
                    print(f"  ✗ Error updating monologue {mono_id}: {e}")
                    errors += 1

        db.commit()

        # Print progress
        if processed % PROGRESS_INTERVAL == 0 or processed >= total:
            print(f"  Progress: {processed}/{total} ({100 * processed / total:.1f}%)")

    print(f"\n✓ Monologues backfill complete: {processed} processed, {errors} errors")


def backfill_film_tv_references(db: Session) -> None:
    """Backfill enriched embeddings for film_tv_references table."""
    print("\n" + "=" * 60)
    print("BACKFILLING FILM_TV_REFERENCES")
    print("=" * 60)

    # Count total rows that need embeddings
    total_query = text("""
        SELECT COUNT(*)
        FROM film_tv_references
        WHERE embedding_vector_v2 IS NULL
    """)
    total = db.execute(total_query).scalar()
    print(f"Total film_tv_references to process: {total}")

    if total == 0:
        print("✓ All film_tv_references already have v2 embeddings!")
        return

    # Fetch rows in batches
    processed = 0
    errors = 0

    while processed < total:
        # Get batch of IDs (no offset - the NULL filter naturally gets the next batch)
        batch_query = text("""
            SELECT id
            FROM film_tv_references
            WHERE embedding_vector_v2 IS NULL
            ORDER BY id
            LIMIT :limit
        """)
        batch_results = db.execute(batch_query, {"limit": BATCH_SIZE}).fetchall()

        if not batch_results:
            break

        ids = [row[0] for row in batch_results]

        # Build enriched texts
        enriched_texts = [build_film_tv_enriched_text(db, row_id) for row_id in ids]

        # Generate embeddings with retry logic
        embeddings = None
        for attempt in range(MAX_RETRIES):
            try:
                embeddings = generate_embeddings_batch(
                    texts=enriched_texts,
                    model="text-embedding-3-large",
                    dimensions=3072,
                )
                break  # Success
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    print(f"  ⚠ Rate limit hit, retrying in {backoff}s... (attempt {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(backoff)
                else:
                    print(f"  ✗ Error generating embeddings after {MAX_RETRIES} attempts: {e}")
                    errors += len(ids)
                    break

        if not embeddings:
            continue

        # Update database
        for row_id, embedding in zip(ids, embeddings):
            if embedding:  # Skip empty embeddings
                try:
                    update_query = text("""
                        UPDATE film_tv_references
                        SET embedding_vector_v2 = :embedding
                        WHERE id = :id
                    """)
                    db.execute(update_query, {"embedding": embedding, "id": row_id})
                    processed += 1
                except Exception as e:
                    print(f"  ✗ Error updating film_tv_reference {row_id}: {e}")
                    errors += 1

        db.commit()

        # Print progress
        if processed % PROGRESS_INTERVAL == 0 or processed >= total:
            print(f"  Progress: {processed}/{total} ({100 * processed / total:.1f}%)")

    print(f"\n✓ Film/TV references backfill complete: {processed} processed, {errors} errors")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill enriched embeddings with text-embedding-3-large (3072 dims)"
    )
    parser.add_argument(
        "--table",
        choices=["monologues", "film_tv", "all"],
        default="all",
        help="Which table to backfill (default: all)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("ENRICHED EMBEDDINGS BACKFILL")
    print("=" * 60)
    print(f"Table: {args.table}")
    print(f"Model: text-embedding-3-large (3072 dims)")
    print(f"Batch size: {BATCH_SIZE}")
    print()

    # Verify API key is set
    if not os.getenv("OPENAI_API_KEY"):
        print("✗ Error: OPENAI_API_KEY not set in environment")
        print("  Please set it in .env or export it")
        sys.exit(1)

    db = SessionLocal()

    try:
        start_time = time.time()

        if args.table in ("monologues", "all"):
            backfill_monologues(db)

        if args.table in ("film_tv", "all"):
            backfill_film_tv_references(db)

        elapsed = time.time() - start_time
        print("\n" + "=" * 60)
        print("✅ BACKFILL COMPLETE")
        print("=" * 60)
        print(f"Time elapsed: {elapsed:.1f}s")
        print()
        print("Next steps:")
        print("  1. Update semantic_search.py to use v2 embeddings")
        print("  2. Test search quality with new embeddings")
        print("  3. Run finalize_embedding_upgrade.py to swap columns")
        print()

    except KeyboardInterrupt:
        print("\n\n⚠ Backfill interrupted by user")
        db.rollback()
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
