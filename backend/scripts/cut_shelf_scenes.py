#!/usr/bin/env python
"""
Cut two-person scenes from the public-domain plays for the scene shelf.

Two steps, so Canberk reads the scenes before any of them is stored:

    # 1. dry run: cut, label, write samples + a manifest. Writes nothing to the DB.
    uv run python scripts/cut_shelf_scenes.py --max-per-play 3
    uv run python scripts/cut_shelf_scenes.py --play-id 812 --play-id 90

    # 2. store what the manifest holds (pointers only, about 1 KB a scene).
    uv run python scripts/cut_shelf_scenes.py --apply ../outputs/shelf/manifest-<date>.json

A run reads every play's full text once (about 25 MB of egress); --play-id
keeps a trial run small. Labels cost one gpt-4o-mini call per kept candidate.
--apply skips a scene already on the shelf, so it is safe to run twice.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")

OUT = backend_dir.parent / "outputs" / "shelf"
#: The length a class scene usually wants; candidates nearest it are labelled first.
TARGET_SECONDS = 180


def _plays(play_ids):
    from sqlalchemy import text

    from app.core.database import engine

    sql = (
        "select id, title, author, year_written, category, text_format, full_text "
        "from plays where copyright_status = 'public_domain' and full_text is not null"
    )
    params = {}
    if play_ids:
        sql += " and id = any(:ids)"
        params["ids"] = list(play_ids)
    with engine.connect().execution_options(postgresql_readonly=True) as conn:
        return [dict(r._mapping) for r in conn.execute(text(sql + " order by id"), params)]


def dry_run(args) -> None:
    from app.services import shelf_labels
    from app.services.extraction import scene_cutter

    plays = _plays(args.play_id)
    chosen, samples = [], []
    for play in plays:
        text = scene_cutter.play_text(play["full_text"], play["text_format"])
        found = scene_cutter.cut_play(text)
        if not found:
            continue
        found.sort(key=lambda c: abs(c.duration_seconds - TARGET_SECONDS))
        kept = []
        for cand in found[: args.max_per_play * 2]:
            labels = shelf_labels.label(
                play["title"], play["author"], cand.character_1, cand.character_2, cand.lines
            )
            if labels["standalone"] < args.min_standalone or not labels["title"]:
                continue
            kept.append((cand, labels))
            if len(kept) >= args.max_per_play:
                break
        kept.sort(key=lambda pair: pair[0].start)
        for cand, labels in kept:
            row = {
                "kind": "public_domain",
                "play_id": play["id"],
                "work_title": play["title"],
                "work_kind": "play",
                "author": play["author"],
                "year": play["year_written"],
                "era": shelf_labels.era_for(play["year_written"], play["category"]),
                "start_offset": cand.start,
                "end_offset": cand.end,
                "text_hash": scene_cutter.span_hash(text, cand.start, cand.end),
                "character_1_name": cand.character_1,
                "character_2_name": cand.character_2,
                "duration_seconds": cand.duration_seconds,
                "line_count": cand.turns,
                **{k: v for k, v in labels.items() if k != "standalone"},
            }
            chosen.append(row)
            samples.append((row, labels["standalone"], cand.lines))
        print(f"{play['title'][:50]}: {len(found)} cut, {len(kept)} kept", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M")
    manifest = OUT / f"manifest-{stamp}.json"
    manifest.write_text(json.dumps(chosen, indent=1))
    md = OUT / f"samples-{stamp}.md"
    with md.open("w") as f:
        f.write(f"# Scene shelf samples, {stamp}\n\n{len(chosen)} scenes from {len(plays)} plays. Nothing is stored yet.\n\n")
        for row, standalone, lines in samples:
            m, s = divmod(row["duration_seconds"], 60)
            f.write(
                f"## {row['title']}\n\n**{row['work_title']}** by {row['author']}, {row['era']}\n\n"
                f"- {row['character_1_name']} ({row['character_1_gender']}, {row['character_1_age_range']}) / "
                f"{row['character_2_name']} ({row['character_2_gender']}, {row['character_2_age_range']})\n"
                f"- {row['line_count']} speeches, about {m}m{s:02d}s, {row['tone']}, standalone {standalone:.2f}\n"
                f"- {row['description']}\n\n```\n"
            )
            for line in lines:
                direction = f" ({line['stage_direction']})" if line.get("stage_direction") else ""
                f.write(f"{line['character']}:{direction} {line['text']}\n")
            f.write("```\n\n")
    print(f"\n{len(chosen)} scenes. Samples: {md}\nManifest: {manifest}")


def apply(path: str) -> None:
    from app.core.database import SessionLocal
    import app.models  # noqa: F401
    from app.models.shelf import ShelfScene

    rows = json.loads(Path(path).read_text())
    db = SessionLocal()
    added = skipped = 0
    try:
        for row in rows:
            exists = db.query(ShelfScene.id).filter(
                ShelfScene.play_id == row["play_id"],
                ShelfScene.start_offset == row["start_offset"],
                ShelfScene.end_offset == row["end_offset"],
            ).first()
            if exists:
                skipped += 1
                continue
            db.add(ShelfScene(status="live", **row))
            added += 1
        db.commit()
    finally:
        db.close()
    print(f"shelf: {added} added, {skipped} already there")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", metavar="MANIFEST")
    ap.add_argument("--play-id", type=int, action="append", default=[])
    ap.add_argument("--max-per-play", type=int, default=3)
    ap.add_argument("--min-standalone", type=float, default=0.6)
    args = ap.parse_args()
    if args.apply:
        apply(args.apply)
    else:
        dry_run(args)


if __name__ == "__main__":
    main()
