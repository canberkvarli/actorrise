"""
Upgrade all embeddings to text-embedding-3-large (3072 dims) IN-PLACE.

Steps:
  1. Drop vector indexes (they enforce dimension constraints)
  2. ALTER columns from vector(1536) to vector(3072)
  3. Generate new 3072-dim embeddings with enriched text
  4. Recreate HNSW indexes

Usage (from backend directory):
    uv run python scripts/upgrade_embeddings_to_3072.py
    uv run python scripts/upgrade_embeddings_to_3072.py --table monologues
    uv run python scripts/upgrade_embeddings_to_3072.py --table film_tv
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.orm import Session

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

load_dotenv()

from app.core.database import SessionLocal, engine
from app.models.actor import Monologue, Play
from app.services.ai.langchain.embeddings import generate_embeddings_batch

BATCH_SIZE = 20
MAX_RETRIES = 3
INITIAL_BACKOFF = 2.0


def migrate_columns():
    """Drop indexes and alter columns from vector(1536) to vector(3072)."""
    print("\n" + "=" * 50)
    print("STEP 1: MIGRATE COLUMNS TO vector(3072)")
    print("=" * 50)

    with engine.begin() as conn:
        # Drop all vector indexes on monologues
        for idx in [
            "monologues_embedding_ivfflat_idx",
            "monologues_embedding_vector_hnsw_idx",
        ]:
            print(f"  Dropping index {idx}...")
            conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))

        # Drop all vector indexes on film_tv_references
        for idx in [
            "film_tv_references_embedding_ivfflat_idx",
            "film_tv_references_embedding_hnsw_idx",
            "ix_film_tv_references_embedding_hnsw",
        ]:
            print(f"  Dropping index {idx}...")
            conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))

        # Clear existing data and ALTER columns to vector(3072)
        # (pgvector can't cast 1536-dim data to 3072 in-place)
        print("  Clearing old 1536-dim embeddings...")
        conn.execute(text("UPDATE monologues SET embedding_vector = NULL"))
        conn.execute(text("UPDATE film_tv_references SET embedding = NULL"))

        print("  Altering monologues.embedding_vector to vector(3072)...")
        conn.execute(text(
            "ALTER TABLE monologues ALTER COLUMN embedding_vector TYPE vector(3072)"
        ))

        print("  Altering film_tv_references.embedding to vector(3072)...")
        conn.execute(text(
            "ALTER TABLE film_tv_references ALTER COLUMN embedding TYPE vector(3072)"
        ))

    print("  Done — columns are now vector(3072), indexes dropped.\n")


def recreate_indexes():
    """Recreate composite btree indexes. Vector indexes skipped — Supabase pgvector
    limits both HNSW and IVFFlat to 2000 dims, but brute-force scans are fast
    enough for ~8K monologues + ~14K film/TV rows (<200ms)."""
    print("\n" + "=" * 50)
    print("STEP 3: RECREATE INDEXES")
    print("=" * 50)

    with engine.begin() as conn:
        print("  Skipping vector indexes (3072 dims > Supabase 2000-dim limit).")
        print("  Brute-force cosine scan is fast enough for current data size.")

        # Recreate the composite btree indexes
        print("  Recreating composite btree indexes...")
        conn.execute(text("""
            DROP INDEX IF EXISTS idx_monologues_gender_emotion;
            CREATE INDEX IF NOT EXISTS idx_monologues_gender_emotion
            ON monologues (character_gender, primary_emotion)
            WHERE embedding_vector IS NOT NULL
        """))
        conn.execute(text("""
            DROP INDEX IF EXISTS idx_monologues_gender_age;
            CREATE INDEX IF NOT EXISTS idx_monologues_gender_age
            ON monologues (character_gender, character_age_range)
            WHERE embedding_vector IS NOT NULL
        """))

    print("  Done — composite indexes created.\n")


def build_monologue_text(mono: Monologue) -> str:
    parts = []
    if mono.character_name:
        play_title = mono.play.title if mono.play else "Unknown Play"
        author = mono.play.author if mono.play else "Unknown Author"
        parts.append(f"{mono.character_name} from {play_title} by {author}.")
    if mono.primary_emotion:
        parts.append(f"Emotion: {mono.primary_emotion}.")
    if mono.tone:
        parts.append(f"Tone: {mono.tone}.")
    if mono.character_gender:
        parts.append(f"Gender: {mono.character_gender}.")
    if mono.character_age_range:
        parts.append(f"Age: {mono.character_age_range}.")
    if mono.themes:
        parts.append(f"Themes: {', '.join(mono.themes)}.")
    if mono.difficulty_level:
        parts.append(f"Difficulty: {mono.difficulty_level}.")
    if mono.text:
        parts.append(mono.text[:800])
    return " ".join(parts)


def build_film_tv_text(db: Session, row_id: int) -> str:
    from app.models.actor import FilmTvReference
    ref = db.query(FilmTvReference).filter(FilmTvReference.id == row_id).first()
    if not ref:
        return ""
    parts = []
    if ref.title:
        year_str = f" ({ref.year})" if ref.year else ""
        parts.append(f"{ref.title}{year_str}.")
    if ref.type:
        parts.append(f"Type: {ref.type}.")
    if ref.genre:
        genre_str = ", ".join(ref.genre) if isinstance(ref.genre, list) else str(ref.genre)
        parts.append(f"Genre: {genre_str}.")
    if ref.director:
        parts.append(f"Director: {ref.director}.")
    if ref.actors:
        actors_str = ", ".join(ref.actors[:5]) if isinstance(ref.actors, list) else str(ref.actors)
        parts.append(f"Actors: {actors_str}.")
    if ref.plot:
        parts.append(ref.plot[:500])
    return " ".join(parts)


class QuotaExhaustedError(Exception):
    """Raised when OpenAI quota is hit — stops the script instead of looping."""
    pass


def generate_batch_with_retry(texts: list[str]) -> list[list[float]] | None:
    for attempt in range(MAX_RETRIES):
        try:
            return generate_embeddings_batch(
                texts=texts,
                model="text-embedding-3-large",
                dimensions=3072,
            )
        except Exception as e:
            err_str = str(e)
            # Stop immediately on quota errors — retrying won't help
            if "insufficient_quota" in err_str or "billing" in err_str:
                raise QuotaExhaustedError(
                    f"OpenAI quota exceeded. Progress saved — rerun with --skip-migrate to resume.\n{e}"
                )
            if attempt < MAX_RETRIES - 1:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                print(f"  Retry in {backoff}s... ({e})")
                time.sleep(backoff)
            else:
                print(f"  Failed after {MAX_RETRIES} attempts: {e}")
                return None


def upgrade_monologues(db: Session) -> tuple[int, int]:
    print("\n" + "=" * 50)
    print("STEP 2a: GENERATING MONOLOGUE EMBEDDINGS")
    print("=" * 50)

    total = db.execute(text("SELECT COUNT(*) FROM monologues")).scalar()
    remaining = db.execute(text(
        "SELECT COUNT(*) FROM monologues WHERE embedding_vector IS NULL"
    )).scalar()
    done_already = total - remaining
    if done_already > 0:
        print(f"Resuming — {done_already}/{total} already done, {remaining} remaining")
    else:
        print(f"Total: {total}")

    processed = 0
    errors = 0

    while True:
        # Only fetch rows that still need embeddings (resumable)
        batch = (
            db.query(Monologue)
            .join(Play)
            .filter(Monologue.embedding_vector.is_(None))
            .order_by(Monologue.id)
            .limit(BATCH_SIZE)
            .all()
        )
        if not batch:
            break

        texts = [build_monologue_text(m) for m in batch]
        ids = [m.id for m in batch]

        embeddings = generate_batch_with_retry(texts)
        if not embeddings:
            errors += len(batch)
            continue

        for mono_id, emb in zip(ids, embeddings):
            if emb:
                db.execute(
                    text("UPDATE monologues SET embedding_vector = :emb WHERE id = :id"),
                    {"emb": str(emb), "id": mono_id},
                )
                processed += 1
            else:
                errors += 1

        db.commit()

        if processed % 100 == 0:
            pct = 100 * (done_already + processed) / max(total, 1)
            print(f"  {done_already + processed}/{total} ({pct:.1f}%)", flush=True)

    print(f"Done: {processed} newly updated, {errors} errors ({done_already + processed}/{total} total)")
    return processed, errors


def upgrade_film_tv(db: Session) -> tuple[int, int]:
    print("\n" + "=" * 50)
    print("STEP 2b: GENERATING FILM/TV EMBEDDINGS")
    print("=" * 50)

    total = db.execute(text("SELECT COUNT(*) FROM film_tv_references")).scalar()
    remaining = db.execute(text(
        "SELECT COUNT(*) FROM film_tv_references WHERE embedding IS NULL"
    )).scalar()
    done_already = total - remaining
    if done_already > 0:
        print(f"Resuming — {done_already}/{total} already done, {remaining} remaining")
    else:
        print(f"Total: {total}")

    processed = 0
    errors = 0

    while True:
        # Only fetch rows that still need embeddings (resumable)
        rows = db.execute(
            text("SELECT id FROM film_tv_references WHERE embedding IS NULL ORDER BY id LIMIT :lim"),
            {"lim": BATCH_SIZE},
        ).fetchall()
        if not rows:
            break

        ids = [r[0] for r in rows]
        texts = [build_film_tv_text(db, rid) for rid in ids]

        embeddings = generate_batch_with_retry(texts)
        if not embeddings:
            errors += len(ids)
            continue

        for rid, emb in zip(ids, embeddings):
            if emb:
                db.execute(
                    text("UPDATE film_tv_references SET embedding = :emb WHERE id = :id"),
                    {"emb": str(emb), "id": rid},
                )
                processed += 1
            else:
                errors += 1

        db.commit()

        if processed % 100 == 0:
            pct = 100 * (done_already + processed) / max(total, 1)
            print(f"  {done_already + processed}/{total} ({pct:.1f}%)", flush=True)

    print(f"Done: {processed} newly updated, {errors} errors ({done_already + processed}/{total} total)")
    return processed, errors


def main() -> None:
    parser = argparse.ArgumentParser(description="Upgrade embeddings to 3072 dims")
    parser.add_argument("--table", choices=["monologues", "film_tv", "all"], default="all")
    parser.add_argument("--skip-migrate", action="store_true", help="Skip column migration (already done)")
    parser.add_argument("--skip-index", action="store_true", help="Skip index recreation")
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY not set")
        sys.exit(1)

    print("=" * 50)
    print("EMBEDDING UPGRADE: text-embedding-3-large (3072)")
    print("=" * 50)
    print(f"Table: {args.table}")

    # Step 1: Migrate columns
    if not args.skip_migrate:
        migrate_columns()

    # Step 2: Generate embeddings
    db = SessionLocal()
    start = time.time()

    try:
        if args.table in ("monologues", "all"):
            upgrade_monologues(db)
        if args.table in ("film_tv", "all"):
            upgrade_film_tv(db)

        elapsed = time.time() - start
        print(f"\nEmbedding generation complete in {elapsed:.1f}s")

    except KeyboardInterrupt:
        print("\nInterrupted — partial progress saved.")
        db.rollback()
        sys.exit(1)
    except Exception as e:
        print(f"\nError: {e}")
        db.rollback()
        raise
    finally:
        db.close()

    # Step 3: Recreate indexes
    if not args.skip_index:
        recreate_indexes()

    print("\n" + "=" * 50)
    print("UPGRADE COMPLETE")
    print("=" * 50)
    print("Update model defs + search code to use 3072 dims.")


if __name__ == "__main__":
    main()
