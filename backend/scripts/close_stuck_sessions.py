"""Close rehearsal sessions stuck in `in_progress`.

38 rows sat in `in_progress` in prod, making the status column meaningless and
poisoning completion math. This backfills them (and any future stragglers) to
`abandoned`. New sessions self-clean via app.services.rehearsal_cleanup on start;
this is the one-time sweep for the pile that already exists.

Dry-run by default — prints what it WOULD close. Pass --apply to write, which
first dumps a reversible backup to backend/backups/ so the change can be undone.

    python scripts/close_stuck_sessions.py            # dry run
    python scripts/close_stuck_sessions.py --apply     # backup + close
    python scripts/close_stuck_sessions.py --hours 12  # custom staleness window
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.services.rehearsal_cleanup import (  # noqa: E402
    STALE_AFTER_HOURS,
    abandon_stale_sessions,
    find_stale_sessions,
)

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--hours", type=int, default=STALE_AFTER_HOURS, help="staleness window in hours")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        stale = find_stale_sessions(db, now=now, hours=args.hours)
        print(f"{len(stale)} in_progress session(s) inactive > {args.hours}h")
        for s in stale[:20]:
            last = s.updated_at or s.started_at
            print(f"  id={s.id} user={s.user_id} scene={s.scene_id} last_activity={last}")
        if len(stale) > 20:
            print(f"  … and {len(stale) - 20} more")

        if not args.apply:
            print("\nDry run — nothing written. Re-run with --apply to close them.")
            return 0

        if stale:
            BACKUP_DIR.mkdir(exist_ok=True)
            stamp = now.strftime("%Y%m%dT%H%M%SZ")
            backup_path = BACKUP_DIR / f"close_stuck_sessions_{stamp}.json"
            backup = [
                {
                    "id": s.id,
                    "status": s.status,
                    "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                }
                for s in stale
            ]
            backup_path.write_text(json.dumps(backup, indent=2))
            print(f"\nBackup written: {backup_path}")

        closed = abandon_stale_sessions(db, now=now, hours=args.hours)
        print(f"Closed {closed} session(s) -> abandoned.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
