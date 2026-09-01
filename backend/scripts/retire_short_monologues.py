"""Retire monologues under the 75-word floor.

At ~150wpm a 60-word speech is twenty-four seconds. It is not broken — Mercutio,
the Nurse, Walt Whitman's worth of real characters are in here — it is simply
not a piece an actor can walk into a room with. The corpus was built on a
40/50-word floor chosen to maximise yield, and it did: 6,165 of 14,777 rows are
clip-length.

RETIRED, NOT DELETED. `review_status='too_short'` takes a row out of search
(see semantic_search.HIDDEN_REVIEW_STATUSES) while leaving it addressable, which
matters because 42 of these are in somebody's saved collection and 343 have been
opened. Deleting them would empty a stranger's shelf to tidy a number. The rows
also stay available if the floor is ever revisited, and `--restore` puts them
back exactly.

'too_short' deliberately is NOT 'pending': pending feeds the admin review queue,
and dropping six thousand rows into it would bury the handful that a human
actually needs to look at.

    python -m scripts.retire_short_monologues                     # dry run
    python -m scripts.retire_short_monologues --apply
    python -m scripts.retire_short_monologues --restore backups/short_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, func  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue, Play  # noqa: E402
from app.services.extraction.monologue_quality import DEFAULT_MIN_WORDS  # noqa: E402

# pgbouncer drops idle pooled connections under a long loop; a dedicated engine
# with pre-ping survives it.
_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
STATUS = "too_short"
CHUNK = 500


def _targets(db):
    """Rows under the floor that are not already retired or under review."""
    return (
        db.query(Monologue.id, Monologue.word_count, Monologue.review_status)
        .filter(Monologue.word_count < DEFAULT_MIN_WORDS)
        .filter(Monologue.review_status.is_(None))
        .order_by(Monologue.id)
    )


def restore(path: Path) -> None:
    """Put every row in the backup back to the status it had."""
    data = json.loads(path.read_text())
    rows = data["rows"] if isinstance(data, dict) else data
    db = SessionLocal()
    try:
        n = 0
        for start in range(0, len(rows), CHUNK):
            for r in rows[start:start + CHUNK]:
                db.query(Monologue).filter(Monologue.id == r["id"]).update(
                    {Monologue.review_status: r["review_status"]},
                    synchronize_session=False,
                )
                n += 1
            db.commit()
            print(f"    restored {n}/{len(rows)}", flush=True)
        print(f"restored {n} rows from {path.name}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    db = SessionLocal()
    try:
        rows = _targets(db).all()
        total = db.query(func.count(Monologue.id)).scalar() or 0

        print(f"floor            {DEFAULT_MIN_WORDS} words")
        print(f"corpus           {total}")
        print(f"to retire        {len(rows)}  ({len(rows) / total:.1%})")
        print(f"remaining after  {total - len(rows)}")

        by_source = (
            db.query(Play.source_type, func.count(Monologue.id))
            .join(Monologue, Monologue.play_id == Play.id)
            .filter(Monologue.word_count < DEFAULT_MIN_WORDS)
            .filter(Monologue.review_status.is_(None))
            .group_by(Play.source_type)
            .all()
        )
        for src, n in sorted(by_source, key=lambda r: -r[1]):
            kept = (
                db.query(func.count(Monologue.id))
                .join(Play, Play.id == Monologue.play_id)
                .filter(Play.source_type == src)
                .filter(Monologue.word_count >= DEFAULT_MIN_WORDS)
                .scalar()
            )
            print(f"  {str(src):6s} retire {n:5d}   keep {kept:5d}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        if not rows:
            print("\nnothing to do")
            return 0

        # Written BEFORE the first update and appended per chunk, not at the end.
        # Two ingest runs were interrupted mid-flight this week and left rows on
        # disk with no undo list, because the list was only serialised once the
        # script finished. A backup that only exists on success is not a backup.
        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"short_{stamp}.json"

        done: list[dict] = []
        for start in range(0, len(rows), CHUNK):
            batch = rows[start:start + CHUNK]
            done.extend(
                {"id": r.id, "word_count": r.word_count,
                 "review_status": r.review_status}
                for r in batch
            )
            bk.write_text(json.dumps({"status": STATUS, "rows": done}, indent=1))
            db.query(Monologue).filter(
                Monologue.id.in_([r.id for r in batch])
            ).update({Monologue.review_status: STATUS}, synchronize_session=False)
            db.commit()
            print(f"    retired {len(done)}/{len(rows)}", flush=True)

        print(f"\nretired {len(done)} monologues as review_status={STATUS!r}")
        print(f"undo: python -m scripts.retire_short_monologues --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
