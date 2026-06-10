#!/usr/bin/env python
"""Delete monologues that are not clean single-speaker speeches.

Targets rows currently flagged `review_status='pending'` whose problems are
STRUCTURAL (screenplay narration, ALL-CAPS/character residue, scene headings,
stage-direction residue) or that are EMPTY/unsalvageable. Length/punctuation-only
flags (too_short / too_long / truncated_end) are NOT touched — those are valid
monologues.

Every deleted row is first serialised (all columns except the embedding) to a
JSON backup so it can be re-inserted if needed. Mirrors the admin delete path:
removes MonologueFavorite rows and unlinks MonologueSubmission.

DRY-RUN by default. Pass --apply to actually delete.

Usage (from backend/):
    uv run python scripts/purge_broken_monologues.py            # dry run
    uv run python scripts/purge_broken_monologues.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import inspect as sa_inspect

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite
from app.models.moderation import MonologueSubmission

# Reasons that mean "this isn't a clean single-speaker monologue".
STRUCTURAL = {
    "caps_residue", "narration", "interleaved_speaker", "scene_heading",
    "parenthetical_direction", "bracket_cue", "html_residue", "weird_chars",
}

BACKUP_DIR = backend_dir / "backups"


def _is_target(reasons) -> bool:
    rs = set(reasons or [])
    if not rs or rs == {"empty"}:
        return True  # empty / unsalvageable
    return bool(rs & STRUCTURAL)


def _row_to_dict(m: Monologue) -> dict:
    d = {}
    for attr in sa_inspect(Monologue).mapper.column_attrs:
        key = attr.key
        if key == "embedding_vector":  # huge + not needed to reconstruct content
            continue
        val = getattr(m, key)
        if isinstance(val, datetime):
            val = val.isoformat()
        d[key] = val
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually delete")
    args = ap.parse_args()

    db = SessionLocal()
    pending = db.query(Monologue).filter(Monologue.review_status == "pending").all()
    targets = [m for m in pending if _is_target(m.review_reasons)]

    print(f"pending in queue: {len(pending)} | delete targets: {len(targets)}")

    if not targets:
        db.close()
        return

    backup = [_row_to_dict(m) for m in targets]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = BACKUP_DIR / "purged_monologues_backup_2026-06-11.json"

    if not args.apply:
        # Still write the backup in dry-run so the exact set is recorded/auditable.
        backup_path.write_text(json.dumps(backup, ensure_ascii=False, default=str),
                               encoding="utf-8")
        print(f"DRY RUN — would delete {len(targets)} monologues.")
        print(f"Backup of the target set written to {backup_path}")
        print("Sample:")
        for m in targets[:8]:
            print(f"  #{m.id} {m.character_name!r} reasons={m.review_reasons} "
                  f"text={' '.join((m.text or '').split())[:70]!r}")
        db.close()
        return

    backup_path.write_text(json.dumps(backup, ensure_ascii=False, default=str),
                           encoding="utf-8")
    print(f"Backup written to {backup_path}")

    deleted, errors = 0, 0
    for m in targets:
        try:
            db.query(MonologueFavorite).filter(
                MonologueFavorite.monologue_id == m.id
            ).delete(synchronize_session=False)
            db.query(MonologueSubmission).filter(
                MonologueSubmission.monologue_id == m.id
            ).update({MonologueSubmission.monologue_id: None}, synchronize_session=False)
            db.delete(m)
            db.flush()
            deleted += 1
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            errors += 1
            print(f"  ! failed to delete #{m.id} ({type(exc).__name__})")
    db.commit()
    db.close()
    print(f"Deleted {deleted} monologues ({errors} errors). Backup: {backup_path}")


if __name__ == "__main__":
    main()
