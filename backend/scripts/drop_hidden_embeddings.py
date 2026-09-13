"""Release the embeddings of rows search can never return.

WHY. On 2026-09-10 Supabase cut the site off: the database had reached 560 MB
against a 500 MB free tier. 342 MB of it -- 61% -- was one column and its index:

    ix_monologues_embedding_vector_hnsw     195 MB
    embedding_vector (1536 x float32)       147 MB

and 4,550 of the 23,950 rows holding that vector were retired ones:

    too_short      4,138
    duplicate        264
    not_monologue    148

Every one is in HIDDEN_REVIEW_STATUSES, which means no search path can return
it, by any query, ever. They were paying full storage for a result set of zero.

WHY IT IS SAFE. A retired row is not deleted and its `text` is untouched, so a
change of policy can still bring it back. What comes back is the row, not the
vector: `app.services.monologue_visibility.unhide` re-embeds on the way in, and
both un-hide paths (the admin review queue and `ungate_above_floor`) go through
it. The vectors are also dumped to backups/ first, so a restore costs no OpenAI
credit at all.

    python -m scripts.drop_hidden_embeddings              # dry run
    python -m scripts.drop_hidden_embeddings --apply
    python -m scripts.drop_hidden_embeddings --restore backups/hidden_vectors_<ts>.json.gz
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.services.search.semantic_search import HIDDEN_REVIEW_STATUSES  # noqa: E402

BACKUP_DIR = backend_dir / "backups"
CHUNK = 500

#: Only the statuses that hide a row *permanently* in the current policy.
#: 'pending' is excluded on purpose: a pending row is waiting for a moderator
#: who will usually approve it, and re-buying its vector minutes later is a
#: worse trade than the ~1 MB it holds.
DROP_STATUSES = tuple(sorted(HIDDEN_REVIEW_STATUSES - {"pending"}))

_WHERE = "review_status = ANY(:statuses) AND embedding_vector IS NOT NULL"


def _engine():
    return create_engine(settings.database_url, pool_pre_ping=True)


def restore(path: Path) -> int:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt") as fh:
        rows = json.load(fh)["rows"]
    eng = _engine()
    n = 0
    with eng.begin() as c:
        for start in range(0, len(rows), CHUNK):
            for r in rows[start:start + CHUNK]:
                c.execute(
                    text("UPDATE monologues SET embedding_vector = CAST(:v AS vector) "
                         "WHERE id = :id"),
                    {"v": str(r["v"]), "id": r["id"]},
                )
                n += 1
            print(f"    restored {n}/{len(rows)}", flush=True)
    print(f"restored {n} vectors from {path.name}")
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return 0

    eng = _engine()
    with eng.connect() as c:
        breakdown = c.execute(
            text(f"SELECT review_status, count(*) n FROM monologues "
                 f"WHERE {_WHERE} GROUP BY 1 ORDER BY 2 DESC"),
            {"statuses": list(DROP_STATUSES)},
        ).fetchall()
        total = sum(r.n for r in breakdown)
        print(f"statuses           {', '.join(DROP_STATUSES)}")
        for r in breakdown:
            print(f"  {r.review_status:<16} {r.n:>6}")
        print(f"to drop            {total} vectors  (~{total * 6148 / 1e6:.0f} MB "
              f"of column, plus their HNSW entries)")

        still = c.execute(text(
            "SELECT count(*) FROM monologues WHERE embedding_vector IS NOT NULL"
        )).scalar()
        print(f"embedded after     {still - total}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0
    if not total:
        print("\nnothing to do")
        return 0

    BACKUP_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    bk = BACKUP_DIR / f"hidden_vectors_{stamp}.json.gz"

    # Dumped in pages: a single SELECT of 4,550 x 1536 floats is ~28 MB on the
    # wire and has killed the SSL connection on this table before.
    dumped: list[dict] = []
    with eng.connect() as c:
        ids = [r.id for r in c.execute(
            text(f"SELECT id FROM monologues WHERE {_WHERE} ORDER BY id"),
            {"statuses": list(DROP_STATUSES)},
        )]
        for start in range(0, len(ids), CHUNK):
            page = ids[start:start + CHUNK]
            for row in c.execute(
                text("SELECT id, embedding_vector::text v FROM monologues "
                     "WHERE id = ANY(:ids)"),
                {"ids": page},
            ):
                dumped.append({"id": row.id, "v": json.loads(row.v)})
            print(f"    dumped {len(dumped)}/{len(ids)}", flush=True)

    with gzip.open(bk, "wt") as fh:
        json.dump({"statuses": list(DROP_STATUSES), "rows": dumped}, fh)
    print(f"backup written to {bk} ({bk.stat().st_size / 1e6:.1f} MB)")

    cleared = 0
    with eng.begin() as c:
        for start in range(0, len(ids), CHUNK):
            page = ids[start:start + CHUNK]
            c.execute(
                text("UPDATE monologues SET embedding_vector = NULL "
                     "WHERE id = ANY(:ids)"),
                {"ids": page},
            )
            cleared += len(page)
            print(f"    cleared {cleared}/{len(ids)}", flush=True)

    print(f"\ndropped {cleared} embeddings")
    print(f"undo: python -m scripts.drop_hidden_embeddings --restore {bk}")
    print("\nThe space is not free until the table and index are rewritten:")
    print("  VACUUM FULL monologues;  REINDEX INDEX ix_monologues_embedding_vector_hnsw;")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
