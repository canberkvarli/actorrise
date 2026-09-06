"""Retire monologues under the word floor (DEFAULT_MIN_WORDS, currently 100).

At ~150wpm a 60-word speech is twenty-four seconds. It is not broken — Mercutio,
the Nurse, Walt Whitman's worth of real characters are in here — it is simply
not a piece an actor can walk into a room with. The corpus was built on a
40/50-word floor chosen to maximise yield, and it did: 6,165 of 14,777 rows are
clip-length.

The floor is DEFAULT_MIN_WORDS and it has moved: 40 -> 75 (061cf80d, 2026-09-01)
-> 100 (a40b42f0, 2026-09-05). This docstring said "75" for a day after it was
no longer true and an audit drew a wrong conclusion from it. Read the constant.

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
from app.services.extraction.monologue_quality import (  # noqa: E402
    DEFAULT_MIN_WORDS,
    min_words_for_source,
)

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
    """Rows under the floor FOR THEIR SOURCE, not already retired or in review.

    The floor is per-source (stage 100, screen 75), so this is not one SQL
    comparison. Filtering in Python against the shared helper is what stops this
    script re-retiring the ~1,500 screen pieces that ungate_above_floor.py just
    freed -- a flat `word_count < DEFAULT_MIN_WORDS` would take every one of them
    straight back out of search on the next run.
    """
    rows = (
        db.query(
            Monologue.id, Monologue.word_count, Monologue.review_status,
            Play.source_type,
        )
        .join(Play, Play.id == Monologue.play_id)
        .filter(Monologue.review_status.is_(None))
        .order_by(Monologue.id)
        .all()
    )
    return [r for r in rows if (r.word_count or 0) < min_words_for_source(r.source_type)]


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
        rows = _targets(db)
        total = db.query(func.count(Monologue.id)).scalar() or 0

        print(f"floor            stage {DEFAULT_MIN_WORDS}w / screen {min_words_for_source('film')}w")
        print(f"corpus           {total}")
        print(f"to retire        {len(rows)}  ({len(rows) / total:.1%})")
        print(f"remaining after  {total - len(rows)}")

        # Counted off the actual target rows. Re-deriving this from a flat
        # `word_count < DEFAULT_MIN_WORDS` reported 914 film and 582 tv rows for
        # retirement on a run whose real target set was empty, because the floor
        # is per-source and that comparison is not.
        by_source: dict[str, int] = {}
        for r in rows:
            by_source[str(r.source_type)] = by_source.get(str(r.source_type), 0) + 1
        for src, n in sorted(by_source.items(), key=lambda r: -r[1]):
            floor = min_words_for_source(src)
            kept = (
                db.query(func.count(Monologue.id))
                .join(Play, Play.id == Monologue.play_id)
                .filter(Play.source_type == src)
                .filter(Monologue.word_count >= floor)
                .scalar()
            )
            print(f"  {src:6s} (floor {floor:3d}w) retire {n:5d}   keep {kept:5d}")

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
