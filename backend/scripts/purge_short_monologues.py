"""Delete the sub-75-word rows, and remember them so they cannot come back.

Retiring them with `review_status='too_short'` took them out of search but left
6,176 rows and about 45 MB in the table, and — worse — left them invisible to
the ingest path. Re-read the same Gutenberg file and the parser produces the same
40-word fragment, the floor rejects it again, and we have paid for the parse and
the language check to relearn yesterday's answer. A deleted row looks brand new
every single time.

So: delete the row, keep the FINGERPRINT. `rejected_extractions` holds the md5
of the normalised text and the reason, never the text itself, and
`pipeline.ingest_play` checks it before doing any work. The same speech arriving
from any source, in any typesetting, is refused for the price of one indexed
lookup.

**Favourited rows are kept.** `monologue_favorites` has no foreign key to
`monologues` — verified, not assumed — so deleting a row somebody saved does not
cascade or error, it silently orphans an entry in their collection. 40 rows are
in that position and 40 rows are not worth breaking a shelf over.

The backup carries every column EXCEPT `embedding_vector`: 5,889 rows x 1536
floats is tens of megabytes of JSON for vectors that would be regenerated
anyway. A restored row therefore needs re-embedding before it is searchable,
which is a fair trade for a row we decided was too short to use.

    python -m scripts.purge_short_monologues            # dry run
    python -m scripts.purge_short_monologues --apply
    python -m scripts.purge_short_monologues --restore backups/purged_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text as sql  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue  # noqa: E402
from app.services.data_ingestion.cross_source_dedupe import (  # noqa: E402
    record_rejection,
)
from app.services.extraction.monologue_quality import DEFAULT_MIN_WORDS  # noqa: E402

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
CHUNK = 250
REASON = "too_short"

#: Everything except the vector. See the module docstring.
COLUMNS = [
    c.name for c in Monologue.__table__.columns if c.name != "embedding_vector"
]


#: Words the actor actually says: the stored text with its parenthesised
#: directions removed. The SQL twin of `monologue_quality.strip_artifacts`.
#:
#: Selecting on the stored `word_count` instead would be wrong in both
#: directions, and measurably so: 90 rows sit above 75 on `word_count` and below
#: it on this, because restoring their stage directions padded the column. They
#: are 51-to-74-word speeches wearing a longer number, and the whole reason the
#: pipeline separates display text from spoken text is so a piece of blocking
#: cannot buy a speech a place in the library.
_SPOKEN_WORDS = (
    "array_length(regexp_split_to_array("
    "btrim(regexp_replace(m.text, '\\([^)]*\\)', '', 'g')), '\\s+'), 1)"
)


def _rows_to_purge(db):
    """Under the floor on SPOKEN words, and nobody has saved it."""
    return db.execute(sql(f"""
        SELECT {', '.join('m.' + c for c in COLUMNS)}, p.title AS _play_title,
               p.source_url AS _source_url
        FROM monologues m
        JOIN plays p ON p.id = m.play_id
        WHERE COALESCE({_SPOKEN_WORDS}, 0) < :floor
          AND NOT EXISTS (
              SELECT 1 FROM monologue_favorites f WHERE f.monologue_id = m.id
          )
        ORDER BY m.id
    """), {"floor": DEFAULT_MIN_WORDS}).mappings().all()


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())["rows"]
    db = SessionLocal()
    try:
        cols = [c for c in COLUMNS]
        stmt = sql(
            f"INSERT INTO monologues ({', '.join(cols)}) "
            f"VALUES ({', '.join(':' + c for c in cols)}) "
            f"ON CONFLICT (id) DO NOTHING"
        )
        done = 0
        for start in range(0, len(rows), CHUNK):
            for r in rows[start:start + CHUNK]:
                db.execute(stmt, {c: r.get(c) for c in cols})
                done += 1
            db.commit()
            print(f"    restored {done}/{len(rows)}", flush=True)
        db.execute(sql(
            "SELECT setval('monologues_id_seq', "
            "GREATEST((SELECT max(id) FROM monologues), 1))"))
        db.commit()
        print(f"restored {done} rows from {path.name}")
        print("NOTE: embeddings were not backed up — re-embed before these are "
              "searchable.")
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
        rows = _rows_to_purge(db)
        kept = db.execute(sql(f"""
            SELECT count(*) FROM monologues m
            WHERE COALESCE({_SPOKEN_WORDS}, 0) < :floor
              AND EXISTS (SELECT 1 FROM monologue_favorites f
                          WHERE f.monologue_id = m.id)
        """), {"floor": DEFAULT_MIN_WORDS}).scalar() or 0
        total = db.execute(sql("SELECT count(*) FROM monologues")).scalar() or 0

        # Retired on the old measure, but the actor really does say 75+ words.
        # Restoring stage directions moved `word_count` on ~95 rows; on the
        # spoken count only a handful of those are genuinely over the floor.
        freed = db.execute(sql(f"""
            SELECT count(*) FROM monologues m
            WHERE m.review_status = 'too_short'
              AND COALESCE({_SPOKEN_WORDS}, 0) >= :floor
        """), {"floor": DEFAULT_MIN_WORDS}).scalar() or 0

        print(f"floor                {DEFAULT_MIN_WORDS} spoken words")
        print(f"corpus               {total}")
        print(f"to DELETE            {len(rows)}")
        print(f"kept (favourited)    {kept}")
        print(f"un-retire (over floor on spoken words)  {freed}")
        print(f"corpus after         {total - len(rows)}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        if not rows:
            print("\nnothing to do")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"purged_{stamp}.json"

        done: list[dict] = []
        for start in range(0, len(rows), CHUNK):
            batch = rows[start:start + CHUNK]
            for r in batch:
                rec = {c: r[c] for c in COLUMNS}
                for k, v in rec.items():          # datetimes -> ISO for JSON
                    if isinstance(v, datetime):
                        rec[k] = v.isoformat()
                done.append(rec)
                # The whole point: the fingerprint outlives the row.
                record_rejection(
                    db, r["text"], REASON,
                    word_count=r["word_count"],
                    character_name=r["character_name"],
                    play_title=r["_play_title"],
                    source_url=r["_source_url"],
                )
            # Backup written BEFORE the delete, every chunk, so an interrupted
            # run still has an undo list for what it actually removed.
            bk.write_text(json.dumps({"rows": done}, indent=1, default=str))
            db.execute(
                sql("DELETE FROM monologues WHERE id = ANY(:ids)"),
                {"ids": [r["id"] for r in batch]},
            )
            db.commit()
            print(f"    deleted {len(done)}/{len(rows)}", flush=True)

        # Anything still flagged that clears the floor on SPOKEN words was
        # retired by the old stored-word_count measure and should be back.
        restored = db.execute(sql(f"""
            UPDATE monologues m SET review_status = NULL
            WHERE m.review_status = 'too_short'
              AND COALESCE({_SPOKEN_WORDS}, 0) >= :floor
        """), {"floor": DEFAULT_MIN_WORDS}).rowcount
        db.commit()

        print(f"\ndeleted {len(done)} monologues, fingerprinted as {REASON!r}")
        print(f"un-retired {restored} that clear the floor on spoken words")
        print(f"undo: python -m scripts.purge_short_monologues --restore {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
