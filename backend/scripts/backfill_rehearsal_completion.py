#!/usr/bin/env python
"""
Backfill rehearsal-session completion + duration after the completion-math fix.

Before the fix, completion was measured against ALL scene lines (user + AI), so
sessions where the actor delivered every one of THEIR lines still showed
"in_progress"/"abandoned" and never got a duration. This retroactively:

  1. Marks a session "completed" when current_line_index >= (count of the user's
     own lines in the scene) — i.e. they delivered all their lines. Sets
     completion_percentage=100 and completed_at (uses the existing completed_at,
     else updated_at, as the finish time).
  2. Fills duration_seconds (completed_at - started_at) for any ended session
     (completed or abandoned) that's missing it.

Reversible: prior (status, completion_percentage, completed_at, duration_seconds)
for every touched row is dumped to backups/rehearsal_completion_backup.json.

Usage:
    uv run python scripts/backfill_rehearsal_completion.py            # dry-run
    uv run python scripts/backfill_rehearsal_completion.py --apply
    uv run python scripts/backfill_rehearsal_completion.py --restore backups/rehearsal_completion_backup.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.api.scenes import _duration_seconds
from app.core.database import SessionLocal
from app.models.actor import RehearsalSession, SceneLine
# pylint: enable=wrong-import-position

BACKUP_DIR = backend_dir / "backups"
BACKUP_PATH = BACKUP_DIR / "rehearsal_completion_backup.json"


def restore(backup_path: Path) -> None:
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    for mid, prev in data.items():
        db.query(RehearsalSession).filter(RehearsalSession.id == int(mid)).update(
            {
                RehearsalSession.status: prev["status"],
                RehearsalSession.completion_percentage: prev["completion_percentage"],
                RehearsalSession.completed_at: (
                    datetime.fromisoformat(prev["completed_at"]) if prev["completed_at"] else None
                ),
                RehearsalSession.duration_seconds: prev["duration_seconds"],
            },
            synchronize_session=False,
        )
    db.commit()
    db.close()
    print(f"Restored {len(data)} rehearsal sessions from {backup_path}")


def run(*, apply: bool) -> None:
    db = SessionLocal()

    # user_line_count per scene/character, computed once.
    sessions = db.query(RehearsalSession).all()
    line_counts: dict[tuple[int, str], int] = {}

    def user_line_count(scene_id: int, char: str) -> int:
        key = (scene_id, char)
        if key not in line_counts:
            line_counts[key] = (
                db.query(SceneLine)
                .filter(SceneLine.scene_id == scene_id, SceneLine.character_name == char)
                .count()
            )
        return line_counts[key]

    backup: dict[str, dict] = {}
    if apply and BACKUP_PATH.exists():
        backup = json.loads(BACKUP_PATH.read_text(encoding="utf-8"))

    completed_n = duration_n = 0
    for s in sessions:
        char = str(s.user_character) if s.user_character is not None else ""
        ulc = user_line_count(int(s.scene_id), char) if char else 0
        ci = int(s.current_line_index) if s.current_line_index is not None else 0
        changed = {}

        # 1. Genuine completion: delivered all of the user's own lines.
        if ulc > 0 and ci >= ulc and str(s.status) != "completed":
            finish = s.completed_at or s.updated_at or datetime.now(timezone.utc)
            changed["status"] = "completed"
            changed["completion_percentage"] = 100.0
            changed["completed_at"] = finish
            completed_n += 1

        # 2. Duration for any ended session missing it.
        finish_for_dur = changed.get("completed_at", s.completed_at)
        if s.duration_seconds is None and finish_for_dur is not None and s.started_at is not None:
            dur = _duration_seconds(s.started_at, finish_for_dur)
            if dur is not None:
                changed["duration_seconds"] = dur
                duration_n += 1

        if not changed:
            continue

        label = "completed" if "status" in changed else "duration"
        print(f"  [{label:<9}] session {s.id} ({char}: {ci}/{ulc} lines)"
              f" -> status={changed.get('status', s.status)},"
              f" dur={changed.get('duration_seconds', s.duration_seconds)}s"
              + ("" if apply else "  [dry-run]"))

        if apply:
            backup.setdefault(str(s.id), {
                "status": str(s.status),
                "completion_percentage": float(s.completion_percentage) if s.completion_percentage is not None else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                "duration_seconds": int(s.duration_seconds) if s.duration_seconds is not None else None,
            })
            db.query(RehearsalSession).filter(RehearsalSession.id == s.id).update(
                changed, synchronize_session=False
            )

    if apply:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        db.commit()
        print(f"\nBackup: {BACKUP_PATH} ({len(backup)} rows)")
    db.close()
    print(f"\n{'APPLIED' if apply else 'DRY-RUN'}: {completed_n} marked completed, "
          f"{duration_n} durations filled.")
    if not apply:
        print("Re-run with --apply to persist.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill rehearsal completion + duration.")
    ap.add_argument("--apply", action="store_true", help="persist changes (default: dry-run)")
    ap.add_argument("--restore", type=Path, default=None, help="restore from backup JSON and exit")
    args = ap.parse_args()
    if args.restore:
        restore(args.restore)
        return
    run(apply=args.apply)


if __name__ == "__main__":
    main()
