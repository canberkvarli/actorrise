"""Per-table storage settings, in version control rather than only on the server.

WHY THESE EXIST. `monologues` carries 13 indexes, one of which is a 159 MB HNSW
vector index. An UPDATE that changes no indexed column can be applied as a HOT
update -- the new row version stays on the same page and not one index is
touched. An UPDATE that cannot go HOT rewrites all 13.

Only 14% of 207,001 updates were HOT, and the index had crept 152 -> 159 MB in
two hours with no new content added. The cause is the default `fillfactor=100`:
pages are packed with no room for a second row version, so Postgres must place
it on another page and repoint every index.

60% of the writes are eligible. The big ones are the corpus maintenance scripts
(text_segments 47,531, durations 13,876, overdone scores 12,237), not reader
traffic -- `view_count` is 4,138 updates, 3%. The columns those scripts write
are unindexed, so with page room they cost no index writes at all.

WHAT IS AND IS NOT FIXED BY RUNNING THIS. `fillfactor` applies to pages written
AFTER it is set, so an already-packed table improves only as autovacuum frees
space. Measured here: 14% -> 27% HOT immediately. The rest arrives when the
table is next rewritten (VACUUM FULL / the halfvec migration), and that rewrite
is the point at which this should be re-measured.

The aggressive autovacuum settings matter for the same reason: reclaimed space
is what HOT updates live on, and the 0.2 default means waiting for ~4,800 dead
tuples on this table before anything is returned.

    python -m scripts.apply_table_storage_params            # show current vs wanted
    python -m scripts.apply_table_storage_params --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text  # noqa: E402

from app.core.config import settings  # noqa: E402

#: table -> storage parameters. Keep the reason next to the number.
STORAGE_PARAMS: dict[str, dict[str, str]] = {
    "monologues": {
        # Room on each page for a second row version, so an update to an
        # unindexed column does not have to repoint 13 indexes.
        "fillfactor": "90",
        # Return dead space promptly; HOT updates are spent out of it. The 0.2
        # default waits for ~4,800 dead tuples on a 24k-row table.
        "autovacuum_vacuum_scale_factor": "0.02",
        "autovacuum_vacuum_threshold": "1000",
        "autovacuum_analyze_scale_factor": "0.05",
    },
}


def current(c, table: str) -> dict[str, str]:
    opts = c.execute(
        text("SELECT reloptions FROM pg_class WHERE relname = :t"), {"t": table}
    ).scalar()
    return dict(o.split("=", 1) for o in (opts or []))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    eng = create_engine(settings.database_url, pool_pre_ping=True)
    c = eng.connect().execution_options(isolation_level="AUTOCOMMIT")

    drift = False
    for table, wanted in STORAGE_PARAMS.items():
        have = current(c, table)
        print(f"\n{table}")
        missing = {}
        for k, v in wanted.items():
            ok = have.get(k) == v
            drift = drift or not ok
            if not ok:
                missing[k] = v
            print(f"  {k:<36} {have.get(k, '(unset)'):>8}  ->  {v:>6}"
                  f"{'' if ok else '   DRIFT'}")
        if missing and args.apply:
            sets = ", ".join(f"{k} = {v}" for k, v in missing.items())
            c.execute(text(f"ALTER TABLE {table} SET ({sets})"))
            print(f"  applied: {sets}")
            # Reclaim now so the freed space is available to HOT updates
            # immediately. Plain VACUUM: no lock, the site stays up.
            c.execute(text(f"VACUUM (ANALYZE) {table}"))
            print("  vacuumed (no lock)")

    if drift and not args.apply:
        print("\nDRIFT — re-run with --apply")
        return 1
    print("\nall storage parameters match" if not drift else "\napplied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
