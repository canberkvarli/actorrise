#!/usr/bin/env python
"""
Migration: add content_request_requesters, and backfill it from search_logs.

`content_requests` dedupes by (title, author) and counts presses. It has never
recorded WHO pressed, so the demand was known and the person was not. This adds
the link table and recovers the existing askers.

THE BACKFILL. The requester is recoverable because the track button stores the
same text the actor searched: joining `content_requests.play_title` against
`search_logs.query` (and against `content_gap->>'play'`, which is how a named
title reaches the queue) found a user for 13 of the 14 rows on 2026-09-07. The
one miss is "drgff", which nobody will ever fulfil anyway.

Matching is deliberately conservative: exact on lowercased, trimmed text. A
fuzzy join here would put the wrong actor's name on an email, which is worse
than not sending it.

    uv run python scripts/add_content_request_requesters.py            # dry run
    uv run python scripts/add_content_request_requesters.py --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text  # noqa: E402

from app.core.database import engine  # noqa: E402

STATEMENTS = [
    text(
        """
        CREATE TABLE IF NOT EXISTS content_request_requesters (
            id SERIAL PRIMARY KEY,
            content_request_id INTEGER NOT NULL
                REFERENCES content_requests(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            notified_at TIMESTAMP
        )
        """
    ),
    text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_content_request_requesters_unique "
        "ON content_request_requesters (content_request_id, user_id)"
    ),
    text(
        "CREATE INDEX IF NOT EXISTS ix_content_request_requesters_user "
        "ON content_request_requesters (user_id)"
    ),
]

# created_at comes from the SEARCH, not from now(): "you asked about this a
# while back" should be true of the date it says.
BACKFILL = text(
    """
    INSERT INTO content_request_requesters (content_request_id, user_id, created_at)
    SELECT DISTINCT ON (cr.id, sl.user_id) cr.id, sl.user_id, min(sl.created_at)
    FROM content_requests cr
    JOIN search_logs sl
      ON lower(btrim(sl.query)) = lower(btrim(cr.play_title))
      OR lower(btrim(sl.content_gap->>'play')) = lower(btrim(cr.play_title))
    WHERE sl.user_id IS NOT NULL
    GROUP BY cr.id, sl.user_id
    ON CONFLICT (content_request_id, user_id) DO NOTHING
    """
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    with engine.begin() as conn:
        exists = conn.execute(
            text("SELECT to_regclass('public.content_request_requesters')")
        ).scalar()
        print(f"table exists already: {bool(exists)}")

        would = conn.execute(
            text(
                """
                SELECT count(*) FROM (
                  SELECT cr.id, sl.user_id
                  FROM content_requests cr
                  JOIN search_logs sl
                    ON lower(btrim(sl.query)) = lower(btrim(cr.play_title))
                    OR lower(btrim(sl.content_gap->>'play')) = lower(btrim(cr.play_title))
                  WHERE sl.user_id IS NOT NULL
                  GROUP BY cr.id, sl.user_id
                ) x
                """
            )
        ).scalar()
        requests = conn.execute(text("SELECT count(*) FROM content_requests")).scalar()
        print(f"content_requests rows:      {requests}")
        print(f"requester links to backfill: {would}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0

        for stmt in STATEMENTS:
            conn.execute(stmt)
        result = conn.execute(BACKFILL)
        print(f"\ntable ready; backfilled {result.rowcount} requester links")

        covered = conn.execute(
            text(
                "SELECT count(DISTINCT content_request_id) "
                "FROM content_request_requesters"
            )
        ).scalar()
        print(f"requests with a known asker: {covered}/{requests}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
