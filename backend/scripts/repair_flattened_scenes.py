#!/usr/bin/env python
"""Re-extract film monologues that are flattened dialogue scenes. DRY-RUN by default.

The March 2026 IMSDb HTML ingest produced rows that are a whole two-person scene
collapsed into one "monologue": the other character's lines were removed and
what remained was concatenated, sometimes out of order. #9750 (Joker) runs
backwards through the Murray interview. #10774 (10 Things I Hate About You) is
27 fragments and still contains another character's line.

The bug is confined to that one retired path:

    Mar 25-27  IMSDb HTML     791 rows    78 flagged
    May-Aug    ScriptSlug PDF ~3,250      1 flagged

`segment_screenplay` (the ScriptSlug path) is clean because it tracks x-position
cue bands and flushes on a speaker change. But the later runs SKIPPED these
films as already-present, so the bad rows were never reprocessed.

This script re-fetches each affected film's screenplay from ScriptSlug, re-parses
it properly, and replaces the broken monologue with a real contiguous speech by
the same character. Anything that cannot be matched is queued for manual review
rather than guessed at or silently deleted.

Why not repair with an LLM: the interleaved-dialogue cleanup could use one
because the fix was "delete the intruding lines" and a subsequence guard proved
deletions-only. Here the correct monologue is one contiguous run among several
and the row no longer carries the ordering, so there is nothing to prove a fix
against. Re-extraction from source is the only honest repair.

Usage (from backend/):
    uv run python scripts/repair_flattened_scenes.py                 # dry-run
    uv run python scripts/repair_flattened_scenes.py --limit 5
    uv run python scripts/repair_flattened_scenes.py --apply
    uv run python scripts/repair_flattened_scenes.py --restore backups/flattened_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    has_flattened_scene,
)
from app.services.extraction.screenplay_pdf_parser import extract_with_status

from scripts.ingest_film_monologues import (  # reuse the proven fetch path
    _norm_title,
    fetch_pdf,
    film_slugs,
    parse_film_slug,
)

_engine = create_engine(
    settings.database_url, pool_size=5, max_overflow=10,
    pool_pre_ping=True, pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, expire_on_commit=False, bind=_engine
)

BACKUP_DIR = backend_dir / "backups"
MIN_WORDS = 90     # matches the film ingest's audition-length floor
MAX_WORDS = 400


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())
    db = SessionLocal()
    try:
        for r in rows:
            m = db.query(Monologue).filter(Monologue.id == r["id"]).first()
            if not m:
                continue
            m.text = r["old_text"]
            m.word_count = r["old_word_count"]
            m.review_status = r.get("old_review_status")
            m.review_reasons = r.get("old_review_reasons")
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def _norm_name(v: str) -> str:
    return "".join(c for c in (v or "").lower() if c.isalnum())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None, help="max films to process")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return

    # --- Phase 1: find the broken rows, detach, close the session ---
    db = SessionLocal()
    try:
        rows = (
            db.query(
                Monologue.id, Monologue.character_name, Monologue.text,
                Monologue.word_count, Monologue.review_status,
                Monologue.review_reasons, Play.id, Play.title,
            )
            .join(Play, Play.id == Monologue.play_id)
            .filter(Play.source_type == "film")
            .all()
        )
    finally:
        db.close()

    broken = [
        {
            "id": r[0], "character": r[1], "old_text": r[2],
            "old_word_count": r[3], "old_review_status": r[4],
            "old_review_reasons": list(r[5]) if r[5] else None,
            "play_id": r[6], "play_title": r[7],
        }
        for r in rows if has_flattened_scene(r[2])
    ]

    by_film: dict[int, list[dict]] = {}
    for b in broken:
        by_film.setdefault(b["play_id"], []).append(b)

    print(f"{len(broken)} flattened rows across {len(by_film)} films\n")
    if not broken:
        return

    # --- Phase 2: map each film to a ScriptSlug slug ---
    print("loading ScriptSlug sitemap...")
    slug_index: dict[str, str] = {}
    for slug in film_slugs():
        meta = parse_film_slug(slug)
        if meta:
            slug_index.setdefault(_norm_title(meta["title"]), slug)
    print(f"  {len(slug_index)} film slugs\n")

    films = list(by_film.items())
    if args.limit:
        films = films[:args.limit]

    ops: list[dict] = []
    unmatched: list[str] = []

    for play_id, items in films:
        title = items[0]["play_title"]
        # A film we cannot re-fetch still has broken rows. Queue them for review
        # rather than leaving them live and unflagged, which is how they
        # survived the last four months.
        def _queue_all(why: str) -> None:
            unmatched.append(title)
            for it in items:
                ops.append({**it, "kind": "queue"})
            print(f"  {title[:38]:38s} {why} ({len(items)} queued)")

        slug = slug_index.get(_norm_title(title))
        if not slug:
            _queue_all("no_scriptslug_match")
            continue

        content, reason = fetch_pdf(slug)
        if content is None:
            _queue_all(f"fetch_failed {reason}")
            continue
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
                fh.write(content)
                fh.flush()
                cands, status = extract_with_status(
                    fh.name, min_words=MIN_WORDS, max_words=MAX_WORDS
                )
        except Exception as exc:  # noqa: BLE001 — one bad PDF must not stop the run
            _queue_all(f"parse_failed {type(exc).__name__}")
            continue

        # Group fresh candidates by character so a broken row can be matched to
        # a real speech by the SAME character rather than any speech in the film.
        by_char: dict[str, list[dict]] = {}
        for c in cands:
            by_char.setdefault(_norm_name(c["character"]), []).append(c)

        for item in items:
            pool = by_char.get(_norm_name(item["character"]), [])
            pool = [
                c for c in pool
                if not has_flattened_scene(c["text"])
                and assess_monologue_quality(c.get("dialogue") or c["text"]).ok
            ]
            if not pool:
                ops.append({**item, "kind": "queue"})
                print(f"  {title[:38]:38s} {item['character'][:14]:14s} queue")
                continue
            best = max(pool, key=lambda c: c["word_count"])
            ops.append({
                **item, "kind": "replace",
                "new_text": best["text"],
                "new_word_count": best["word_count"],
            })
            print(f"  {title[:38]:38s} {item['character'][:14]:14s} "
                  f"replace {item['old_word_count']}w -> {best['word_count']}w")

    n_replace = sum(1 for o in ops if o["kind"] == "replace")
    n_queue = sum(1 for o in ops if o["kind"] == "queue")
    print(f"\n{n_replace} replaceable, {n_queue} to queue, "
          f"{len(unmatched)} films unmatched")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup = BACKUP_DIR / f"flattened_{ts}.json"
    backup.write_text(json.dumps(ops, indent=2))
    print(f"\nbackup written: {backup}")

    from app.services.ai.content_analyzer import ContentAnalyzer
    from app.services.ai.embedding_text_builder import build_monologue_enriched_text
    analyzer = ContentAnalyzer()

    done = 0
    db = SessionLocal()
    try:
        for op in ops:
            m = db.query(Monologue).filter(Monologue.id == op["id"]).first()
            if not m:
                continue
            if op["kind"] == "queue":
                m.review_status = "pending"
                m.review_reasons = ["quality", "flattened_scene"]
            else:
                m.text = op["new_text"]
                # word_count is a STORED column — stale values silently break the
                # duration filters and the film/TV word gate.
                m.word_count = op["new_word_count"]
                m.review_status = None
                m.review_reasons = None
                try:
                    m.embedding_vector = analyzer.generate_embedding(
                        build_monologue_enriched_text(m)
                    )
                except Exception as exc:  # noqa: BLE001
                    print(f"  re-embed failed for {op['id']}: {exc}")
            done += 1
            if done % 20 == 0:
                db.commit()
        db.commit()
    finally:
        db.close()

    print(f"applied {done} rows")
    print(f"undo: uv run python scripts/repair_flattened_scenes.py --restore {backup}")


if __name__ == "__main__":
    main()
