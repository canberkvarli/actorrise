"""Split the historical `abandoned` pile into `abandoned` and `timed_out`.

Two different events were both written as `abandoned`:

  * the client fired the abandon beacon on the way out — we know when they left
    and how long they stayed; and
  * the 6-hour sweep closed a session the user silently walked away from — we
    only knew that later, and the old sweep stamped `completed_at` with the
    moment it noticed rather than the moment they were last seen.

The second kind is identifiable with certainty: only the sweep left
`duration_seconds` NULL (the abandon endpoint always sets it). In prod that
signature matched exactly the same 40 rows as "completed_at more than 6h after
started_at", which is the sweep's fingerprint — so the two independent tests
agree and the classification is safe.

Last activity comes from delivered lines, NOT `updated_at`. `updated_at` moves
on any write to the row, and the August 2026 backfill stamped 38 of these 40
rows with one identical timestamp — deriving a duration from it yields 221-day
rehearsals. A delivered line is something the actor actually did.

For each swept row this rewrites:
  status          -> timed_out
  completed_at    -> last delivered line, else started_at
  duration_seconds-> start to last delivered line (0 when no lines were ever
                     delivered — they opened the scene and never spoke)

Dry-run by default. --apply writes, after dumping a reversible backup to
backend/backups/.

    python scripts/reclassify_timed_out_sessions.py           # dry run
    python scripts/reclassify_timed_out_sessions.py --apply    # backup + rewrite
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from app.models.actor import RehearsalSession  # noqa: E402
from app.services.rehearsal_cleanup import (  # noqa: E402
    TIMED_OUT_STATUS,
    last_delivery_times,
    session_duration_seconds,
)

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"


def find_swept(db) -> list[RehearsalSession]:
    """Rows the sweep closed: abandoned, but with no recorded duration."""
    return (
        db.query(RehearsalSession)
        .filter(
            RehearsalSession.status == "abandoned",
            RehearsalSession.duration_seconds.is_(None),
        )
        .order_by(RehearsalSession.started_at)
        .all()
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = find_swept(db)
        print(f"{len(rows)} abandoned session(s) look swept, not user-exited\n")

        deliveries = last_delivery_times(db, [s.id for s in rows])
        silent = [s for s in rows if s.id not in deliveries]

        for s in rows[:20]:
            last = deliveries.get(s.id)
            gap_days = (
                (s.completed_at - s.started_at).days
                if s.completed_at and s.started_at
                else None
            )
            evidence = f"last line {last}" if last else "NEVER DELIVERED A LINE"
            print(
                f"  id={s.id} user={s.user_id} started={s.started_at} "
                f"| {evidence} | completed_at claimed {gap_days}d later "
                f"-> real duration {session_duration_seconds(s, last)}s"
            )
        if len(rows) > 20:
            print(f"  … and {len(rows) - 20} more")

        if rows:
            print(
                f"\n{len(silent)} of {len(rows)} never delivered a single line — "
                "they opened the scene and left. Those become 0s sessions."
            )

        if not args.apply:
            print("\nDry run — nothing written. Re-run with --apply.")
            return 0

        if not rows:
            print("Nothing to do.")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = BACKUP_DIR / f"reclassify_timed_out_{stamp}.json"
        backup_path.write_text(
            json.dumps(
                [
                    {
                        "id": s.id,
                        "status": s.status,
                        "completed_at": s.completed_at.isoformat() if s.completed_at else None,
                        "duration_seconds": s.duration_seconds,
                    }
                    for s in rows
                ],
                indent=2,
            )
        )
        print(f"\nBackup written: {backup_path}")

        for s in rows:
            last = deliveries.get(s.id)
            s.status = TIMED_OUT_STATUS
            s.completed_at = last or s.started_at
            s.duration_seconds = session_duration_seconds(s, last)
        db.commit()
        print(f"Rewrote {len(rows)} session(s) -> {TIMED_OUT_STATUS}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
