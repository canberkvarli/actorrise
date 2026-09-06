"""Clear `review_status='too_short'` from rows that are no longer short.

WHY THESE ROWS EXIST. On 2026-09-01 (061cf80d) the ETL stopped stripping stage
directions and the floor went 40 -> 75. Rows were retired in the same pass, but
the retirement decision was made against text that the same run then restored,
and `word_count` was resynced afterwards. So a set of rows carries a status that
says "under the floor" while storing a word count that is over it.

THE FLOOR IS PER-SOURCE. Stage 100 words, screen 75 (see
monologue_quality.min_words_for_source). A flat 100 is calibrated for the stage
and retires 43% of the TV corpus, whose median piece is 106 words. The band it
was cutting is not fragments: Red's parole hearing from The Shawshank Redemption
is 78 words.

This script never hardcodes a number. It asks the same helper the parsers ask,
so it can only ever free rows the current policy would itself keep.

Retire and restore are the mirror of scripts/retire_short_monologues.py, which
uses the same helper and so will not re-gate what this frees.

    python -m scripts.ungate_above_floor                       # dry run
    python -m scripts.ungate_above_floor --apply
    python -m scripts.ungate_above_floor --restore backups/ungated_<ts>.json
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
    SCREEN_MIN_WORDS,
    min_words_for_source,
)

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
STATUS = "too_short"
CHUNK = 500


def _targets(db):
    """Retired rows whose stored word count clears the floor FOR THEIR SOURCE.

    The floor is per-source (stage 100, screen 75), so this cannot be one SQL
    comparison. The retired set is only a few thousand rows, so it is filtered
    in Python against the same helper the parsers use — never a literal, or this
    script drifts from the extractor the next time a floor moves.
    """
    rows = (
        db.query(
            Monologue.id, Monologue.word_count, Monologue.review_status,
            Play.source_type,
        )
        .join(Play, Play.id == Monologue.play_id)
        .filter(Monologue.review_status == STATUS)
        .order_by(Monologue.id)
        .all()
    )
    return [r for r in rows if (r.word_count or 0) >= min_words_for_source(r.source_type)]


def restore(path: Path) -> None:
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
        total_gated = (
            db.query(func.count(Monologue.id))
            .filter(Monologue.review_status == STATUS)
            .scalar()
        )
        still_gated = total_gated - len(rows)

        print(f"floor              stage {DEFAULT_MIN_WORDS}w / screen {SCREEN_MIN_WORDS}w")
        print(f"to un-gate         {len(rows)}  (retired, but >= the floor)")
        print(f"left retired       {still_gated}  (genuinely under the floor)")

        if rows:
            ids = [r.id for r in rows]
            by_source = (
                db.query(Play.source_type, func.count(Monologue.id))
                .join(Monologue, Monologue.play_id == Play.id)
                .filter(Monologue.id.in_(ids))
                .group_by(Play.source_type)
                .all()
            )
            for src, n in sorted(by_source, key=lambda r: -r[1]):
                print(f"  {str(src):6s} {n:5d}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        if not rows:
            print("\nnothing to do")
            return 0

        # Backup written before the first update and appended per chunk, so an
        # interrupted run still leaves a usable undo list.
        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"ungated_{stamp}.json"

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
            ).update({Monologue.review_status: None}, synchronize_session=False)
            db.commit()
            print(f"    un-gated {len(done)}/{len(rows)}", flush=True)

        print(f"\nun-gated {len(done)} monologues (review_status -> NULL)")
        print(f"undo: python -m scripts.ungate_above_floor --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
