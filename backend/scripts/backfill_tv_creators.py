"""
Backfill creators for TV shows whose `plays.author` is empty or "Unknown".

As of 2026-08-17: 354 TV titles / 2,168 monologues carry no creator, i.e. 99.6%
of the TV corpus. Film is 0% missing, so this is specific to how TV was ingested.
It matters because the author is what an actor says out loud in the room, and
because it lands in the meta description of 12,011 public monologue pages.

WHY OMDB AND NOT AN LLM
-----------------------
The first version of this script asked gpt-4o-mini for each creator. It returned
"confident" on 344 of 354 with a confidence that was only ever 1.00 or 0.90, and
it was plainly hallucinating: Shogun credited to Franklin J. Schaffner (a film
director, dead since 1989), In Treatment to Ryan Murphy (it is Hagai Levi), and
Chris Carter attached to 16 different shows as an apparent fallback. A wrong
attribution is worse than a blank one because it is invisible and plausible.

This is a lookup, not a judgement call. OMDb's series-level `Writer` field IS the
created-by credit (Better Call Saul -> "Vince Gilligan, Peter Gould"), and 265 of
the 354 plays already carry a `film_tv_reference_id` pointing at an exact IMDb
id, so for those there is nothing to guess about. The remaining ~89 fall back to
a title search that must agree on both the normalised title and Type=series, or
it is left for a human.

DRY-RUN by default: writes a report and changes nothing. Review the report, then
`--apply`. Every applied change is backed up and `--restore` undoes it.

Usage:
    uv run python scripts/backfill_tv_creators.py                  # dry-run report
    uv run python scripts/backfill_tv_creators.py --limit 20       # sample first
    uv run python scripts/backfill_tv_creators.py --apply
    uv run python scripts/backfill_tv_creators.py --restore backups/tv_creators_backup_*.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import FilmTvReference, Monologue, Play
# pylint: enable=wrong-import-position

BACKUP_DIR = backend_dir / "backups"
REPORT_DIR = backend_dir / "reports"

OMDB_API_BASE = "http://www.omdbapi.com/"
PLACEHOLDER_AUTHORS = {"", "unknown", "n/a", "na", "various", "anonymous", "uncredited"}

# OMDb annotates some writer credits with their role. When it does, the creator
# credit is the only one we want; when it does not, the Writer list on a series
# is already the created-by line.
CREATOR_ROLE = re.compile(r"\((created by|creator|developed by)\)", re.I)
PARENTHETICAL = re.compile(r"\s*\([^)]*\)")
MAX_CREATORS = 3


def _is_placeholder(author: str | None) -> bool:
    return (author or "").strip().lower() in PLACEHOLDER_AUTHORS


def _normalise(title: str) -> str:
    """Loose title match: case, punctuation, and a leading article are noise."""
    t = re.sub(r"[^\w\s]", "", (title or "").lower())
    t = re.sub(r"^(the|a|an)\s+", "", t)
    return re.sub(r"\s+", " ", t).strip()


def parse_writers(writer_field: str | None) -> str:
    """Turn OMDb's Writer string into an author line, or "" if unusable."""
    raw = (writer_field or "").strip()
    if not raw or raw.upper() == "N/A":
        return ""

    parts = [p.strip() for p in raw.split(",") if p.strip()]
    tagged = [p for p in parts if CREATOR_ROLE.search(p)]
    if tagged:
        parts = tagged

    names = []
    for part in parts:
        name = PARENTHETICAL.sub("", part).strip(" .")
        # A bare initial or a leftover role word is not a name.
        if len(name) < 3 or name.upper() == "N/A":
            continue
        if name not in names:
            names.append(name)

    return ", ".join(names[:MAX_CREATORS])


def _omdb(params: dict, api_key: str) -> dict:
    try:
        resp = requests.get(
            OMDB_API_BASE, params={**params, "apikey": api_key}, timeout=20
        )
        return resp.json() if resp.ok else {}
    except (requests.RequestException, ValueError):
        # One bad lookup must not kill a 354-title run.
        return {}


def lookup(play: Play, imdb_id: str | None, api_key: str) -> dict:
    """Resolve one play to a creator. Returns a report row."""
    row = {
        "play_id": play.id,
        "title": play.title,
        "original_author": play.author,
        "creator": "",
        "matched_via": None,
        "imdb_id": imdb_id,
        "omdb_title": None,
        "omdb_year": None,
        "omdb_writer": None,
        "reason": "",
    }

    if imdb_id:
        data = _omdb({"i": imdb_id}, api_key)
        row["matched_via"] = "imdb_id"
    else:
        # No stored id, so the title has to earn the match on its own.
        data = _omdb({"t": play.title, "type": "series"}, api_key)
        if not data or data.get("Response") == "False":
            # Exact-title lookup is punctuation-sensitive and our titles have had
            # theirs stripped ("The Handmaids Tale"), so fall back to search and
            # keep the first hit that agrees once both sides are normalised.
            found = _omdb({"s": play.title, "type": "series"}, api_key).get("Search") or []
            hit = next(
                (h for h in found if _normalise(h.get("Title", "")) == _normalise(play.title)),
                None,
            )
            data = _omdb({"i": hit["imdbID"]}, api_key) if hit else data
        row["matched_via"] = "title_search"

    if not data or data.get("Response") == "False":
        row["reason"] = "no OMDb record"
        return row

    row["omdb_title"] = data.get("Title")
    row["omdb_year"] = data.get("Year")
    row["omdb_writer"] = data.get("Writer")

    if row["matched_via"] == "title_search":
        if data.get("Type") != "series":
            row["reason"] = f"OMDb returned a {data.get('Type')}, not a series"
            return row
        if _normalise(data.get("Title", "")) != _normalise(play.title):
            row["reason"] = f"title mismatch: OMDb said {data.get('Title')!r}"
            return row
        row["imdb_id"] = data.get("imdbID")

    creator = parse_writers(data.get("Writer"))
    if not creator:
        row["reason"] = "OMDb has no writer credit"
        return row

    row["creator"] = creator
    return row


def restore(backup_path: Path) -> None:
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for row in data:
            play = db.query(Play).filter(Play.id == row["play_id"]).first()
            if play:
                play.author = row["original_author"]
        db.commit()
        print(f"Restored {len(data)} plays from {backup_path}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--limit", type=int, default=None, help="only process the first N titles")
    ap.add_argument("--restore", type=str, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return

    api_key = os.getenv("OMDB_API_KEY")
    if not api_key:
        sys.exit("OMDB_API_KEY is not set. It lives in backend/.env.")

    db = SessionLocal()
    try:
        plays = db.query(Play).filter(Play.source_type == "tv").order_by(Play.id).all()
        targets = [p for p in plays if _is_placeholder(p.author)]
        if args.limit:
            targets = targets[: args.limit]

        ref_ids = [p.film_tv_reference_id for p in targets if p.film_tv_reference_id]
        refs = (
            {r.id: r for r in db.query(FilmTvReference).filter(FilmTvReference.id.in_(ref_ids)).all()}
            if ref_ids
            else {}
        )
        counts = {
            p.id: db.query(Monologue).filter(Monologue.play_id == p.id).count()
            for p in targets
        }
        linked = sum(1 for p in targets if refs.get(p.film_tv_reference_id or -1))
        print(f"{len(targets)} TV titles missing a creator ({sum(counts.values())} monologues)")
        print(f"{linked} carry an exact IMDb id; {len(targets) - linked} need a title search\n")

        proposals, needs_human = [], []
        for i, play in enumerate(targets, 1):
            ref = refs.get(play.film_tv_reference_id or -1)
            row = lookup(play, ref.imdb_id if ref else None, api_key)
            row["monologues"] = counts[play.id]
            (proposals if row["creator"] else needs_human).append(row)
            print(f"[{i}/{len(targets)}] {play.title[:40]:<40} "
                  f"{(row['creator'] or '— ' + row['reason'])[:44]:<44} {row['matched_via']}")
            time.sleep(0.05)

        REPORT_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        report_path = REPORT_DIR / f"tv_creators_report_{stamp}.json"
        report_path.write_text(
            json.dumps({"proposals": proposals, "needs_human": needs_human}, indent=2),
            encoding="utf-8",
        )

        by_id = sum(1 for r in proposals if r["matched_via"] == "imdb_id")
        print(f"\nresolved:      {len(proposals)}  ({by_id} by IMDb id, "
              f"{len(proposals) - by_id} by verified title search)")
        print(f"needs a human: {len(needs_human)}")
        print(f"report: {report_path}")

        if not args.apply:
            print("\nDRY RUN. Nothing written. Review the report, then re-run with --apply.")
            return

        BACKUP_DIR.mkdir(exist_ok=True)
        backup_path = BACKUP_DIR / f"tv_creators_backup_{stamp}.json"
        backup_path.write_text(json.dumps(proposals, indent=2), encoding="utf-8")

        written = 0
        for row in proposals:
            play = db.query(Play).filter(Play.id == row["play_id"]).first()
            # Re-check: never overwrite an author that appeared since the report.
            if play and _is_placeholder(play.author):
                play.author = row["creator"]
                written += 1
        db.commit()
        print(f"\nApplied {written} creators. Backup: {backup_path}")
        print(f"Undo: uv run python scripts/backfill_tv_creators.py --restore {backup_path}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
