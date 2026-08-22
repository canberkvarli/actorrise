#!/usr/bin/env python
"""Fetch film_tv_references for the exact films an ingest run skipped.

`ingest_film_monologues` refuses to write a play row when no reference matches,
because a row with no director is how the TV corpus ended up 99.6% authorless.
That guard is right, but it means every film missing from `film_tv_references`
is silently unreachable — and on the 1,396-slug run roughly a quarter of films
were being dropped for this reason alone.

`seed_film_tv_references.py` fills the table from IMDb dumps by popularity,
which is the wrong shape for this: the films we are missing are precisely the
ones popularity ranking has not reached yet. This looks up the specific titles
that failed, by name and year, straight from OMDb.

Feed it the slugs an ingest run reported as no_metadata:

    grep -B1 no_metadata run.log | grep -oE '^[a-z0-9-]+-[0-9]{4}' > slugs.txt
    uv run python scripts/backfill_refs_for_slugs.py --slugs-file slugs.txt
    uv run python scripts/backfill_refs_for_slugs.py --slugs-file slugs.txt --apply

then re-run the ingest with `--slugs "$(cat slugs.txt | paste -sd,)"`.

Only writes rows that come back with BOTH an imdb_id and a director, since a
reference lacking either leaves the ingest exactly as stuck as before. No
embedding is generated — nothing in the ingest path matches references by
vector, it looks them up by title.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
import requests
from dotenv import load_dotenv
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal
# pylint: enable=wrong-import-position

load_dotenv(backend_dir / ".env")
OMDB = "https://www.omdbapi.com/"
TRAILING_YEAR = re.compile(r"-(\d{4})$")


def parse_slug(slug: str) -> tuple[str, int | None]:
    m = TRAILING_YEAR.search(slug)
    if not m:
        return slug.replace("-", " ").strip().title(), None
    return slug[: m.start()].replace("-", " ").strip().title(), int(m.group(1))


def lookup(title: str, year: int | None, key: str) -> dict | None:
    params = {"apikey": key, "t": title, "type": "movie"}
    if year:
        params["y"] = str(year)
    try:
        r = requests.get(OMDB, params=params, timeout=20)
        data = r.json()
    except Exception:  # noqa: BLE001
        return None
    if data.get("Response") != "True":
        # Retry without the year — OMDb disagrees about release vs festival year.
        if year:
            return lookup(title, None, key)
        return None
    return data


def to_row(d: dict) -> dict | None:
    imdb_id = d.get("imdbID")
    director = (d.get("Director") or "").strip()
    if not imdb_id or not director or director == "N/A":
        return None
    def num(v, cast):
        try:
            return cast(re.sub(r"[^0-9.]", "", v or ""))
        except Exception:  # noqa: BLE001
            return None
    genres = [g.strip() for g in (d.get("Genre") or "").split(",") if g.strip() and g != "N/A"]
    actors = [a.strip() for a in (d.get("Actors") or "").split(",") if a.strip() and a != "N/A"]
    poster = d.get("Poster")
    return {
        "title": d.get("Title"),
        "year": num(d.get("Year"), int),
        "type": "movie",
        "genre": genres or None,
        "plot": (d.get("Plot") if d.get("Plot") != "N/A" else None),
        "director": director,
        "actors": actors or None,
        "runtime_minutes": num(d.get("Runtime"), int),
        "imdb_id": imdb_id,
        "imdb_rating": num(d.get("imdbRating"), float),
        "poster_url": (poster if poster and poster != "N/A" else None),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs-file", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--delay", type=float, default=0.15)
    args = ap.parse_args()

    key = os.getenv("OMDB_API_KEY")
    if not key:
        print("ERROR: OMDB_API_KEY not set in backend/.env")
        sys.exit(1)

    slugs = [s.strip() for s in Path(args.slugs_file).read_text().replace(",", "\n").split()
             if s.strip()]
    print(f"{len(slugs)} slugs to look up\n")

    db = SessionLocal()
    try:
        found, missing, already = [], [], 0
        for slug in slugs:
            title, year = parse_slug(slug)
            exists = db.execute(sa_text(
                "SELECT 1 FROM film_tv_references WHERE lower(title)=lower(:t) "
                "AND director IS NOT NULL LIMIT 1"), {"t": title}).first()
            if exists:
                already += 1
                continue
            data = lookup(title, year, key)
            row = to_row(data) if data else None
            if row:
                found.append((slug, row))
                print(f"  ok      {title[:34]:<36} {row['year']}  {row['director'][:28]}")
            else:
                missing.append(slug)
                print(f"  MISS    {title[:34]:<36} {year or '?'}")
            time.sleep(args.delay)

        print(f"\nalready present: {already}   resolved: {len(found)}   "
              f"not on OMDb: {len(missing)}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        wrote = 0
        for _slug, row in found:
            try:
                db.execute(sa_text("""
                    INSERT INTO film_tv_references
                      (title, year, type, genre, plot, director, actors,
                       runtime_minutes, imdb_id, imdb_rating, poster_url)
                    VALUES (:title,:year,:type,:genre,:plot,:director,:actors,
                            :runtime_minutes,:imdb_id,:imdb_rating,:poster_url)
                    ON CONFLICT (imdb_id) DO NOTHING
                """), row)
                wrote += 1
            except Exception as exc:  # noqa: BLE001
                print(f"  insert failed {row['title']}: {exc}")
        db.commit()
        print(f"inserted {wrote} references")
    finally:
        db.close()


if __name__ == "__main__":
    main()
