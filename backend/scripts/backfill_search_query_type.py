#!/usr/bin/env python
"""
Backfill search_logs.query_type, then make NULL impossible going forward.

The column landed 2026-08-19 and only classifies rows written after that: 44 of
1,170. A column that describes 4% of the table cannot answer the question it
was added for ("are actors arriving with a show name, or browsing by
attribute?"), because the 4% is a week of traffic, not a sample.

Two phases:

  1. Backfill every NULL row through classify_query — the same classifier the
     live logging path uses, so old and new rows are directly comparable.
  2. Seal: SET DEFAULT 'other' + SET NOT NULL, so a future insert that forgets
     the field lands as 'other' instead of silently reopening the hole. The
     default is deliberate rather than a bare NOT NULL: search must never fail
     on an analytics column.

  KNOWN CAVEAT, worth remembering before reading the split too closely.
  The live path passes classify_query three extra signals from the search
  service: parsed_constraints, intended_play, intended_author. None of those
  were stored, so they cannot be recovered for old rows. This backfill passes
  intended_play/intended_author reconstructed from `content_gap` (which was
  derived from them) and leaves parsed_constraints as None. Net effect:
  backfilled rows lean slightly toward `title`/`other` and slightly away from
  `attribute`/`multi` versus a live row for the same text. Compare trends
  within an era, not across the 2026-08-19 boundary.

Idempotent: re-running only touches rows that are still NULL. Phase 2 is
skipped if any NULL survives, so a partial run cannot lock the table into a
state the app cannot write.

Usage:
    uv run python scripts/backfill_search_query_type.py            # dry run
    uv run python scripts/backfill_search_query_type.py --apply
    uv run python scripts/backfill_search_query_type.py --apply --no-seal
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine
from app.services.search.query_type import QUERY_TYPES, classify_query

BATCH_SIZE = 500

SEAL_STATEMENTS = [
    "ALTER TABLE search_logs ALTER COLUMN query_type SET DEFAULT 'other'",
    "ALTER TABLE search_logs ALTER COLUMN query_type SET NOT NULL",
]


def _intent_from_content_gap(gap) -> tuple[str | None, str | None]:
    """Recover (intended_play, intended_author) from a stored content_gap.

    content_gap was computed *from* those two values, so this is the only
    surviving trace of them. Returns (None, None) for rows with no gap.
    """
    if not isinstance(gap, dict):
        return None, None
    play = gap.get("play") or gap.get("play_title")
    author = gap.get("author")
    return (play or None), (author or None)


def backfill(apply: bool) -> int:
    """Classify every NULL row. Returns the number of rows updated."""
    counts: Counter = Counter()
    updated = 0

    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, query, content_gap FROM search_logs "
                    "WHERE query_type IS NULL ORDER BY id LIMIT :n"
                ),
                {"n": BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            updates = []
            for row_id, query, gap in rows:
                play, author = _intent_from_content_gap(gap)
                qt = classify_query(
                    query or "", intended_play=play, intended_author=author
                )
                if qt not in QUERY_TYPES:
                    # classify_query is documented never to raise and always to
                    # return a member; belt and braces so a bad value can never
                    # reach the column we are about to constrain.
                    qt = "other"
                counts[qt] += 1
                updates.append({"id": row_id, "qt": qt})

            if not apply:
                # Dry run: report what the first batch would do and stop, rather
                # than looping forever over rows we are not updating.
                for qt, n in counts.most_common():
                    print(f"  {qt:<13} {n}")
                print(f"(dry run, first {len(rows)} rows only — pass --apply)")
                return 0

            conn.execute(
                text("UPDATE search_logs SET query_type = :qt WHERE id = :id"),
                updates,
            )
            updated += len(updates)
            print(f"  ...{updated} rows classified")

    for qt, n in counts.most_common():
        print(f"  {qt:<13} {n}")
    return updated


def seal() -> bool:
    """Apply DEFAULT + NOT NULL. Refuses while any NULL remains."""
    with engine.begin() as conn:
        remaining = conn.execute(
            text("SELECT count(*) FROM search_logs WHERE query_type IS NULL")
        ).scalar_one()
        if remaining:
            print(f"NOT sealing: {remaining} rows still NULL. Re-run the backfill.")
            return False
        conn.execute(text("SET LOCAL lock_timeout = '5s'"))
        for stmt in SEAL_STATEMENTS:
            conn.execute(text(stmt))
    print("Sealed - query_type DEFAULT 'other', NOT NULL.")
    return True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes")
    ap.add_argument(
        "--no-seal",
        action="store_true",
        help="backfill only; leave the column nullable",
    )
    args = ap.parse_args()

    with engine.begin() as conn:
        total = conn.execute(text("SELECT count(*) FROM search_logs")).scalar_one()
        nulls = conn.execute(
            text("SELECT count(*) FROM search_logs WHERE query_type IS NULL")
        ).scalar_one()
    print(f"search_logs: {total} rows, {nulls} unclassified")
    if not nulls:
        print("Nothing to backfill.")
    else:
        updated = backfill(args.apply)
        if args.apply:
            print(f"Backfilled {updated} rows.")

    if args.apply and not args.no_seal:
        seal()


if __name__ == "__main__":
    main()
