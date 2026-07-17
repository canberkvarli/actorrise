#!/usr/bin/env python
"""Re-tag the default-smelling "30-40" age range on classical monologues.

DRY-RUN by default — prints the proposed distribution and changes NOTHING.

The 2026-07 search audit found 2,141 classical pieces (46% of the corpus for
that bucket) tagged character_age_range='30-40' — a bulk-ingestion default,
not a judgment. That skew makes the age filter unreliable and hides
teen-appropriate classical pieces from teen searchers (16% of demand).

The AI is asked for the age range an actor would PLAY, from the canonical
vocabulary the search filters understand. "30-40" remains a legal answer; the
point is that it becomes a decision instead of a default.

Reversible: originals go to backups/age_retag_backup.json (merged across runs,
first original wins). Idempotent: rows whose id is already in the backup are
skipped on re-runs, so an interrupted run just continues.

Usage (from backend/):
    .venv/bin/python scripts/retag_classical_ages.py                # dry-run
    .venv/bin/python scripts/retag_classical_ages.py --limit 40     # sample
    .venv/bin/python scripts/retag_classical_ages.py --apply
    .venv/bin/python scripts/retag_classical_ages.py --restore backups/age_retag_backup.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

ALLOWED_AGES = {"child", "teens", "20s", "20-30", "30s", "30-40", "40s", "40-50", "50s", "60+", "any"}

BACKUP_DIR = backend_dir / "backups"
BACKUP_PATH = BACKUP_DIR / "age_retag_backup.json"

_RUBRIC = (
    "You are casting director for classical theatre. For each monologue below, "
    "give the age range an actor would typically PLAY for this character, based on "
    "the character, the play, and the text. Choose EXACTLY one value from: "
    "child, teens, 20s, 20-30, 30s, 30-40, 40s, 40-50, 50s, 60+, any. "
    "Use 'any' only when the speech genuinely has no age anchor. Known characters "
    "(Juliet: teens; Hamlet: 20-30; Lear: 60+) should get their canonical playing age. "
    'Reply as JSON: {"ages": [{"id": <id>, "age_range": "<value>"}, ...]}'
)


def parse_ages(raw) -> dict[int, str]:
    """Parse the model's JSON into {id: canonical_age}; drop anything off-vocabulary."""
    out: dict[int, str] = {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return out
    for row in data.get("ages", []):
        try:
            rid = int(row["id"])
        except (KeyError, TypeError, ValueError):
            continue
        age = str(row.get("age_range", "")).strip()
        if age in ALLOWED_AGES:
            out[rid] = age
    return out


def _opening(text: str, words: int = 100) -> str:
    parts = (text or "").split()
    return " ".join(parts[:words])


def _build_prompt(batch: list[dict]) -> str:
    items = [
        {
            "id": m["id"],
            "character": m["character_name"],
            "play": m["play_title"],
            "author": m["play_author"],
            "opening": _opening(m["text"]),
        }
        for m in batch
    ]
    return _RUBRIC + "\n\nMonologues (JSON input):\n" + json.dumps(items, ensure_ascii=False)


def restore(backup_path: Path) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue

    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for mid, original in data.items():
            db.query(Monologue).filter(Monologue.id == int(mid)).update(
                {Monologue.character_age_range: original}, synchronize_session=False
            )
        db.commit()
    finally:
        db.close()
    print(f"Restored character_age_range for {len(data)} monologues from {backup_path}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--batch-size", type=int, default=20)
    ap.add_argument("--restore", metavar="BACKUP_JSON")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return 0

    from app.core.database import SessionLocal
    from app.models.actor import Monologue, Play

    sys.path.insert(0, str(backend_dir / "scripts"))
    from score_overdone import _make_invoke  # reuse backoff/quota handling

    done_ids: set[int] = set()
    if BACKUP_PATH.exists():
        done_ids = {int(k) for k in json.loads(BACKUP_PATH.read_text(encoding="utf-8"))}

    db = SessionLocal()
    try:
        q = (
            db.query(Monologue, Play.title, Play.author)
            .join(Play, Monologue.play_id == Play.id)
            .filter(Play.category.ilike("%classical%"), Monologue.character_age_range == "30-40")
            .order_by(Monologue.id)
        )
        if args.limit:
            q = q.limit(args.limit + len(done_ids))
        rows = [
            {
                "id": m.id,
                "character_name": m.character_name,
                "text": m.text,
                "play_title": ptitle,
                "play_author": pauthor,
            }
            for (m, ptitle, pauthor) in q.all()
            if m.id not in done_ids
        ]
        if args.limit:
            rows = rows[: args.limit]
        print(f"{len(rows)} classical '30-40' rows to re-tag "
              f"(model={args.model}, batch={args.batch_size}, "
              f"{'APPLY' if args.apply else 'DRY-RUN'}; {len(done_ids)} already done)")
        if not rows:
            return 0

        invoke = _make_invoke(args.model)
        dist: collections.Counter = collections.Counter()
        changed = 0

        backup: dict[str, str] = {}
        if args.apply:
            BACKUP_DIR.mkdir(exist_ok=True)
            if BACKUP_PATH.exists():
                backup = json.loads(BACKUP_PATH.read_text(encoding="utf-8"))

        for start in range(0, len(rows), args.batch_size):
            batch = rows[start:start + args.batch_size]
            raw = invoke(_build_prompt(batch))
            if raw is None:
                continue
            ages = parse_ages(raw)
            for m in batch:
                age = ages.get(m["id"])
                if not age:
                    continue
                dist[age] += 1
                if args.apply:
                    backup.setdefault(str(m["id"]), "30-40")
                    db.query(Monologue).filter(Monologue.id == m["id"]).update(
                        {Monologue.character_age_range: age}, synchronize_session=False
                    )
                    if age != "30-40":
                        changed += 1
            if args.apply:
                BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
                db.commit()
            done = min(start + args.batch_size, len(rows))
            print(f"  {done}/{len(rows)}  dist so far: {dict(dist)}")

        print(f"\nfinal distribution: {dict(dist)}")
        if args.apply:
            print(f"applied; {changed} rows moved off '30-40'; backup: {BACKUP_PATH}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
