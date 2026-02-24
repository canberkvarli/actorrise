#!/usr/bin/env python
"""
Seed film_tv_references from IMDb datasets + OMDb API enrichment.

Pipeline:
  1. Download title.basics.tsv.gz and title.ratings.tsv.gz from IMDb
  2. Filter: titleType = movie | tvSeries, numVotes >= 10,000, startYear >= 1950
  3. Enrich each title via OMDb API (100 ms delay between requests)
  4. Use Poster field from OMDb response as poster_url; fall back to
     img.omdbapi.com only when Poster is "N/A"
  5. Generate 3072-dim embedding with enriched format (text-embedding-3-large)
  6. Upsert into film_tv_references (skip on duplicate imdb_id)

Requires OMDB_API_KEY in environment / backend/.env
Reads DATABASE_URL and OPENAI_API_KEY from the same .env

Usage (from backend directory):
    uv run python scripts/seed_film_tv_references.py [--limit N] [--dry-run]

--limit N   : process only the first N matching IMDb titles (default 3000).
             When not dry-run, we first exclude titles already in the DB,
             then take the next N missing titles (by popularity). So each run
             progresses through the list without re-processing duplicates.
--dry-run   : fetch and parse but do not write to the database
"""

from __future__ import annotations

import argparse
import gzip
import io
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# Load .env then app imports (C0413 wrong-import-position by design).
# pylint: disable=wrong-import-position
from dotenv import load_dotenv

load_dotenv(backend_dir / ".env")

from app.core.database import SessionLocal
from app.models.actor import FilmTvReference
from app.services.ai.langchain.embeddings import generate_embedding
# pylint: enable=wrong-import-position

# ── Constants ──────────────────────────────────────────────────────────────────

IMDB_BASICS_URL = "https://datasets.imdbws.com/title.basics.tsv.gz"
IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"

OMDB_API_BASE = "http://www.omdbapi.com/"
OMDB_POSTER_BASE = "http://img.omdbapi.com/"
OMDB_DELAY_SEC = 0.1  # 100 ms between OMDb requests

MIN_VOTES = 10_000
MIN_YEAR = 1950
ALLOWED_TYPES = {"movie", "tvSeries"}

# Only generate embeddings for titles at or above this rating threshold.
# Titles below get stored with embedding=NULL — still searchable via text/ILIKE.
# Keeps DB size under the Supabase 500 MB free tier.
EMBEDDING_MIN_RATING = 7.5

LOG_EVERY = 100  # log progress every N records


# ── IMDb helpers ───────────────────────────────────────────────────────────────

def _download_gz_tsv(url: str) -> list[dict]:
    """Download a gzipped TSV from IMDb and return rows as dicts."""
    print(f"  Downloading {url} …")
    resp = requests.get(url, stream=True, timeout=300)
    resp.raise_for_status()

    raw = b""
    total = 0
    for chunk in resp.iter_content(chunk_size=1 << 20):  # 1 MB chunks
        raw += chunk
        total += len(chunk)
        if total % (10 << 20) < (1 << 20):  # log every ~10 MB
            print(f"    … {total // (1 << 20)} MB downloaded")

    print(f"  Downloaded {total // (1 << 20)} MB. Decompressing …")
    with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8") as f:
        lines = f.read().splitlines()

    if not lines:
        return []

    headers = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) != len(headers):
            continue
        rows.append(dict(zip(headers, parts)))

    print(f"  Parsed {len(rows):,} rows.")
    return rows


def load_imdb_candidates(limit: Optional[int] = None) -> list[dict]:
    """
    Download, join, and filter IMDb datasets.
    Returns list of dicts with keys: tconst, titleType, primaryTitle, startYear,
    numVotes, averageRating.
    """
    print("Loading IMDb title basics …")
    basics = _download_gz_tsv(IMDB_BASICS_URL)

    print("Loading IMDb title ratings …")
    ratings_rows = _download_gz_tsv(IMDB_RATINGS_URL)

    # Build ratings lookup: tconst -> (averageRating, numVotes)
    print("Building ratings index …")
    ratings: dict[str, tuple[float, int]] = {}
    for r in ratings_rows:
        tconst = r.get("tconst", "")
        try:
            avg = float(r.get("averageRating", "0"))
            votes = int(r.get("numVotes", "0"))
        except ValueError:
            continue
        ratings[tconst] = (avg, votes)

    print(f"  {len(ratings):,} rated titles indexed.")

    print("Filtering candidates …")
    candidates = []
    for b in basics:
        tconst = b.get("tconst", "")
        title_type = b.get("titleType", "")
        if title_type not in ALLOWED_TYPES:
            continue

        start_year_raw = b.get("startYear", "\\N")
        if start_year_raw == "\\N":
            continue
        try:
            start_year = int(start_year_raw)
        except ValueError:
            continue
        if start_year < MIN_YEAR:
            continue

        if tconst not in ratings:
            continue
        avg_rating, num_votes = ratings[tconst]
        if num_votes < MIN_VOTES:
            continue

        candidates.append({
            "tconst": tconst,
            "titleType": title_type,
            "primaryTitle": b.get("primaryTitle", ""),
            "startYear": start_year,
            "numVotes": num_votes,
            "averageRating": avg_rating,
        })

    # Sort by votes descending so the most popular titles are processed first
    candidates.sort(key=lambda x: x["numVotes"], reverse=True)

    print(f"  {len(candidates):,} candidates after filtering.")

    if limit:
        candidates = candidates[:limit]
        print(f"  Capped at {limit} titles (--limit flag).")

    return candidates


# ── OMDb helpers ───────────────────────────────────────────────────────────────

def fetch_omdb(imdb_id: str, api_key: str) -> Optional[dict]:
    """Fetch full OMDb metadata for a single IMDb ID. Returns None on error."""
    params = {"i": imdb_id, "plot": "full", "apikey": api_key}
    try:
        resp = requests.get(OMDB_API_BASE, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("Response") == "False":
            return None
        return data
    except (requests.RequestException, ValueError) as e:
        print(f"    OMDb error for {imdb_id}: {e}")
        return None


def _parse_runtime(runtime_str: str) -> Optional[int]:
    """Parse '142 min' -> 142. Returns None if unparseable."""
    if not runtime_str or runtime_str == "N/A":
        return None
    parts = runtime_str.split()
    try:
        return int(parts[0])
    except ValueError:
        return None


def _parse_list(value: str) -> list[str]:
    """Parse 'Actor A, Actor B, Actor C' -> ['Actor A', 'Actor B', 'Actor C']."""
    if not value or value == "N/A":
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def _parse_rating(value: str) -> Optional[float]:
    """Parse '8.3' -> 8.3. Returns None if unparseable."""
    if not value or value == "N/A":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _poster_url(omdb_data: dict, imdb_id: str, api_key: str) -> Optional[str]:
    """
    Return the poster URL.
    - Use Poster field from OMDb response if it's not 'N/A'.
    - Fall back to img.omdbapi.com only when Poster is 'N/A'.
    """
    poster = omdb_data.get("Poster", "")
    if poster and poster != "N/A":
        return poster
    # Fallback: construct img.omdbapi.com URL
    return f"{OMDB_POSTER_BASE}?i={imdb_id}&h=600&apikey={api_key}"


# ── Embedding helpers ──────────────────────────────────────────────────────────

def _embedding_text(title: str, year: Optional[int], genre: list[str],
                    plot: Optional[str], actors: list[str],
                    director: Optional[str], title_type: Optional[str] = None) -> str:
    """
    Build enriched text for film/TV embedding.

    Format matches app.services.ai.embedding_text_builder.build_film_tv_enriched_text
    for consistency with backfilled monologues.
    """
    parts = []

    # Title and year
    if title:
        year_str = f" ({year})" if year else ""
        parts.append(f"{title}{year_str}.")

    # Type (movie/tvSeries)
    if title_type:
        parts.append(f"Type: {title_type}.")

    # Genre
    if genre:
        genre_str = ", ".join(genre)
        parts.append(f"Genre: {genre_str}.")

    # Director
    if director and director != "N/A":
        parts.append(f"Director: {director}.")

    # Actors (limit to first 5)
    if actors:
        actors_str = ", ".join(actors[:5])
        parts.append(f"Actors: {actors_str}.")

    # Plot (truncate to 500 chars to keep embedding focused)
    if plot and plot != "N/A":
        plot_snippet = plot[:500]
        parts.append(plot_snippet)

    return " ".join(parts)


# ── Main ───────────────────────────────────────────────────────────────────────

def get_existing_imdb_ids(db) -> set[str]:
    """Return set of imdb_id already in film_tv_references."""
    from sqlalchemy import select
    rows = db.execute(select(FilmTvReference.imdb_id)).fetchall()
    return {r[0] for r in rows if r[0]}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed film_tv_references from IMDb + OMDb")
    parser.add_argument("--limit", type=int, default=3000,
                        help="Max new titles to process per run (default 3000). "
                             "Only titles not already in DB are counted.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and parse data but do not write to the database")
    args = parser.parse_args()

    omdb_api_key = os.getenv("OMDB_API_KEY")
    if not omdb_api_key:
        print("ERROR: OMDB_API_KEY not set. Add it to backend/.env and retry.")
        sys.exit(1)

    print("=" * 64)
    print("SEED film_tv_references")
    print("=" * 64)
    if args.dry_run:
        print("DRY RUN — no data will be written to the database.")
    print()

    # Step 1 — Load IMDb candidates (no cap here; we filter and cap below)
    all_candidates = load_imdb_candidates(limit=None)
    if not all_candidates:
        print("No candidates found. Exiting.")
        return

    # Step 2 — When writing to DB, exclude titles already in DB so we only process "next" N
    db = None if args.dry_run else SessionLocal()
    if db:
        existing_ids = get_existing_imdb_ids(db)
        candidates = [c for c in all_candidates if c["tconst"] not in existing_ids]
        print(f"  {len(existing_ids):,} titles already in DB; {len(candidates):,} remaining to consider.")
        candidates = candidates[: args.limit]
        print(f"  Processing next {len(candidates)} new titles (--limit={args.limit}).")
    else:
        candidates = all_candidates[: args.limit]
        print(f"  DRY RUN: processing first {len(candidates)} candidates (no DB filter).")

    total = len(candidates)
    if total == 0:
        print("No new titles to process (DB is up to date for this list). Exiting.")
        return

    # Step 3–6 — Enrich + embed + save

    saved = 0
    skipped_omdb = 0
    skipped_duplicate = 0
    idx = -1  # defined so final summary is valid if loop exits early (e.g. KeyboardInterrupt)

    try:
        for idx, cand in enumerate(candidates):
            tconst = cand["tconst"]
            primary_title = cand["primaryTitle"]
            title_type = cand["titleType"]

            # Step 2 — OMDb enrichment
            omdb = fetch_omdb(tconst, omdb_api_key)
            time.sleep(OMDB_DELAY_SEC)

            if omdb is None:
                skipped_omdb += 1
                if (idx + 1) % LOG_EVERY == 0:
                    print(f"[{idx + 1}/{total}] Processed — saved={saved}, "
                          f"skipped_omdb={skipped_omdb}, dupes={skipped_duplicate}")
                continue

            title = omdb.get("Title") or primary_title
            year_str = omdb.get("Year", "")
            year: Optional[int] = None
            try:
                # Year can be "2008" or "2008–2013"
                year = int(year_str[:4]) if year_str and year_str != "N/A" else cand["startYear"]
            except ValueError:
                year = cand["startYear"]

            genre_list = _parse_list(omdb.get("Genre", ""))
            plot = omdb.get("Plot") or None
            if plot == "N/A":
                plot = None
            director = omdb.get("Director") or None
            if director == "N/A":
                director = None
            actors_list = _parse_list(omdb.get("Actors", ""))
            runtime_minutes = _parse_runtime(omdb.get("Runtime", ""))
            imdb_rating = _parse_rating(omdb.get("imdbRating", ""))

            # Step 3 — Poster URL
            poster = _poster_url(omdb, tconst, omdb_api_key)

            # Step 4 — Embedding (only for quality titles to stay under DB limit)
            # Use text-embedding-3-large (3072 dims) with enriched format
            embedding = None
            if imdb_rating is not None and imdb_rating >= EMBEDDING_MIN_RATING:
                emb_text = _embedding_text(title, year, genre_list, plot, actors_list, director, title_type)
                embedding = generate_embedding(
                    text=emb_text,
                    model="text-embedding-3-large",
                    dimensions=3072
                )

            if args.dry_run:
                if (idx + 1) % LOG_EVERY == 0:
                    print(f"[{idx + 1}/{total}] DRY RUN — title={title!r}, "
                          f"year={year}, type={title_type}, "
                          f"embedding={'ok' if embedding else 'FAILED'}")
                saved += 1
                continue

            # Step 5 — Upsert into DB
            existing = db.query(FilmTvReference).filter(
                FilmTvReference.imdb_id == tconst
            ).first()

            if existing:
                skipped_duplicate += 1
            else:
                ref = FilmTvReference(
                    title=title,
                    year=year,
                    type=title_type,
                    genre=genre_list or None,
                    plot=plot,
                    director=director,
                    actors=actors_list or None,
                    runtime_minutes=runtime_minutes,
                    imdb_id=tconst,
                    imdb_rating=imdb_rating,
                    poster_url=poster,
                    imsdb_url=None,  # left null for now
                    embedding=embedding if embedding else None,
                )
                db.add(ref)
                saved += 1

            # Commit in batches of 100 to avoid long transactions
            if (idx + 1) % LOG_EVERY == 0:
                if not args.dry_run:
                    db.commit()
                print(f"[{idx + 1}/{total}] Processed — saved={saved}, "
                      f"skipped_omdb={skipped_omdb}, dupes={skipped_duplicate}")

        # Final commit
        if not args.dry_run and db:
            db.commit()

    except KeyboardInterrupt:
        print("\nInterrupted by user.")
        if not args.dry_run and db:
            db.commit()
    finally:
        if db:
            db.close()

    print()
    print("=" * 64)
    print("✅ SEED COMPLETE")
    print(f"   Titles processed : {idx + 1 if total else 0}")
    print(f"   Saved to DB      : {saved}")
    print(f"   OMDb misses      : {skipped_omdb}")
    print(f"   Duplicates       : {skipped_duplicate}")
    print("=" * 64)


if __name__ == "__main__":
    main()
