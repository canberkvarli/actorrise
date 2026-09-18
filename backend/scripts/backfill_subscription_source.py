#!/usr/bin/env python
"""
Backfill user_subscriptions.source.

`source` is meant to say where a membership came from — "stripe" for a real
checkout, "manual" for a comp granted in the admin. Both writers set it today
(webhooks.handle_checkout_completed and admin.users.grant_admin_user_membership),
but the column arrived after most rows did, so 40 of them carry NULL and the
only way to tell a comp from a paying subscriber is to notice that
`stripe_subscription_id` is empty.

That inference is correct and is what the admin serializer now uses, but it
should not be necessary twice. This writes it down:

    stripe_subscription_id IS NOT NULL  -> 'stripe'
    stripe_subscription_id IS NULL      -> 'manual'

Only touches rows where source IS NULL, so a value written by either endpoint
is never overwritten.

Usage:
    uv run python scripts/backfill_subscription_source.py          # dry run
    uv run python scripts/backfill_subscription_source.py --apply
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

PREVIEW = """
SELECT CASE WHEN stripe_subscription_id IS NOT NULL THEN 'stripe' ELSE 'manual' END AS would_set,
       status, count(*) AS rows
FROM user_subscriptions WHERE source IS NULL
GROUP BY 1, 2 ORDER BY 3 DESC
"""

UPDATE = """
UPDATE user_subscriptions
SET source = CASE WHEN stripe_subscription_id IS NOT NULL THEN 'stripe' ELSE 'manual' END
WHERE source IS NULL
"""


def main() -> None:
    apply = "--apply" in sys.argv
    with engine.begin() as conn:
        rows = conn.execute(text(PREVIEW)).fetchall()
        if not rows:
            print("No rows with a NULL source. Nothing to do.")
            return
        total = 0
        for would_set, status, count in rows:
            print(f"  {count:4}  {status:10} -> source = {would_set}")
            total += count
        if not apply:
            print(f"\nDry run. {total} rows would be set. Re-run with --apply.")
            return
        result = conn.execute(text(UPDATE))
        print(f"\nSet source on {result.rowcount} rows.")


if __name__ == "__main__":
    main()
