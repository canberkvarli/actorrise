#!/usr/bin/env python
"""Collapse duplicate monologues down to one row each. DRY-RUN by default.

The corpus carries duplicate speeches because the film and TV ingests never
called a deduplicator — `MonologueDeduplicator` is only wired into
scrape_all_sources.py, and even there it only compares against rows whose play
title AND author already match, which a second source rarely reproduces
exactly.

Duplicates are grouped by the same normalised-text fingerprint the ingest guard
now uses (see services/data_ingestion/cross_source_dedupe.py), so this only ever
merges rows that are word-for-word identical once case, punctuation and
whitespace are ignored. Near-identical rows are NOT touched here: at that point
a human should decide which reading is better.

Which row survives, in order:
  1. most saved by real users   — never orphan someone's saved piece
  2. most viewed                — the one search has been sending people to
  3. lowest id                  — oldest, so any external link keeps working

Usage (from backend/):
    uv run python scripts/dedupe_monologues.py               # dry run
    uv run python scripts/dedupe_monologues.py --apply
    uv run python scripts/dedupe_monologues.py --restore backups/dedupe_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text as sqltext
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, MonologueFavorite

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
BACKUP_DIR = backend_dir / "backups"

GROUPS_SQL = sqltext(
    """
    WITH fp AS (
      SELECT m.id, m.play_id, m.view_count, m.character_name, m.title,
             p.title AS play_title, p.source_type,
             md5(regexp_replace(lower(m.text), '[^a-z0-9]', '', 'g')) AS h,
             (SELECT count(*) FROM monologue_favorites f
                WHERE f.monologue_id = m.id) AS saved_by
      FROM monologues m JOIN plays p ON p.id = m.play_id
    )
    SELECT h, json_agg(json_build_object(
             'id', id, 'saved_by', saved_by, 'views', view_count,
             'character', character_name, 'play', play_title,
             'source_type', source_type) ORDER BY id) AS rows
    FROM fp GROUP BY h HAVING count(*) > 1
    """
)


def restore(path: Path) -> None:
    """Re-insert deleted rows from a backup. Favourites are NOT restored — the
    join rows were removed with them and are not recoverable from here."""
    rows = json.loads(path.read_text())
    db = SessionLocal()
    try:
        for r in rows:
            if db.query(Monologue).filter(Monologue.id == r["id"]).first():
                continue
            db.add(Monologue(**r["row"]))
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return

    db = SessionLocal()
    try:
        groups = db.execute(GROUPS_SQL).all()
    finally:
        db.close()

    doomed: list[dict] = []
    for _h, rows in groups:
        # Best row first: saved, then viewed, then oldest.
        ordered = sorted(
            rows, key=lambda r: (-r["saved_by"], -r["views"], r["id"])
        )
        keep, drop = ordered[0], ordered[1:]
        for d in drop:
            doomed.append({"keep": keep, "drop": d})

    print(f"{len(groups)} duplicate groups, {len(doomed)} redundant rows\n")
    protected = [d for d in doomed if d["drop"]["saved_by"] > 0]
    for d in doomed[:15]:
        k, x = d["keep"], d["drop"]
        print(
            f"  keep #{k['id']:<6} ({k['saved_by']}s/{k['views']}v)  "
            f"drop #{x['id']:<6} ({x['saved_by']}s/{x['views']}v)  "
            f"{x['character'][:16]:16s} {x['play'][:26]}"
        )
    if len(doomed) > 15:
        print(f"  ... and {len(doomed) - 15} more")
    if protected:
        print(
            f"\n{len(protected)} row(s) to drop are saved by a user; their twin "
            f"is saved more or equally. Review these by hand:"
        )
        for d in protected:
            print(f"  #{d['drop']['id']} saved_by={d['drop']['saved_by']}")

    if not args.apply:
        print("\nDRY RUN — nothing deleted. Re-run with --apply.")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup = BACKUP_DIR / f"dedupe_{ts}.json"

    db = SessionLocal()
    saved_rows, deleted = [], 0
    try:
        for d in doomed:
            m = db.query(Monologue).filter(Monologue.id == d["drop"]["id"]).first()
            if not m:
                continue
            saved_rows.append({
                "id": m.id,
                "kept_instead": d["keep"]["id"],
                "row": {
                    c.name: getattr(m, c.name)
                    for c in Monologue.__table__.columns
                    if c.name != "embedding_vector"  # not JSON-serialisable
                },
            })
        backup.write_text(json.dumps(saved_rows, indent=2, default=str))
        print(f"\nbackup written: {backup}")

        for d in doomed:
            mid = d["drop"]["id"]
            db.query(MonologueFavorite).filter(
                MonologueFavorite.monologue_id == mid
            ).delete(synchronize_session=False)
            db.query(Monologue).filter(Monologue.id == mid).delete(
                synchronize_session=False
            )
            deleted += 1
        db.commit()
    finally:
        db.close()

    print(f"deleted {deleted} redundant rows")
    print(f"undo: uv run python scripts/dedupe_monologues.py --restore {backup}")


if __name__ == "__main__":
    main()
