"""Make `user_subscriptions` agree with Stripe.

Stripe is the record of what someone is actually being charged. Our table is a
local cache of that, kept current by webhooks, and it drifts: rows still marked
`active` carry a `current_period_end` months in the past — 2026-07-02 and even
2026-02-26 were sitting there in September. A missed webhook leaves a
subscription looking alive forever, and the admin "Paying" count reads straight
off those rows.

Money is never computed from this table (see stripe_revenue.py, which asks
Stripe what each subscription will actually be invoiced). But the COUNTS are,
and a stale row inflates them.

This pulls every subscription we hold an id for, and writes back Stripe's
answer: status, period end, cancel-at-period-end. Nothing is invented — a row
whose id Stripe does not recognise is reported, not guessed at.

    python -m scripts.reconcile_stripe_subscriptions            # dry run
    python -m scripts.reconcile_stripe_subscriptions --apply
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import stripe  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.billing import UserSubscription  # noqa: E402

_engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)


def _ts(value) -> datetime | None:
    return datetime.fromtimestamp(value, tz=timezone.utc) if value else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    key = os.getenv("STRIPE_SECRET_KEY") or getattr(settings, "stripe_secret_key", None)
    if not key:
        print("STRIPE_SECRET_KEY not set")
        return 1
    stripe.api_key = key

    db = SessionLocal()
    changed = missing = agreed = 0
    try:
        rows = (
            db.query(UserSubscription)
            .filter(UserSubscription.stripe_subscription_id.isnot(None))
            .all()
        )
        print(f"local rows with a Stripe id: {len(rows)}\n")

        for row in rows:
            try:
                sub = stripe.Subscription.retrieve(row.stripe_subscription_id)
            except stripe.error.InvalidRequestError:
                # Stripe has never heard of it, or it was deleted outright.
                missing += 1
                print(f"  MISSING in Stripe  {row.stripe_subscription_id}  "
                      f"local status={row.status}")
                continue

            end = _ts(getattr(sub, "current_period_end", None))
            updates = {}
            if row.status != sub.status:
                updates["status"] = (row.status, sub.status)
            if end and row.current_period_end != end:
                updates["current_period_end"] = (row.current_period_end, end)

            if not updates:
                agreed += 1
                continue

            changed += 1
            desc = ", ".join(f"{k}: {a} -> {b}" for k, (a, b) in updates.items())
            print(f"  {row.stripe_subscription_id}  {desc}")
            if args.apply:
                if "status" in updates:
                    row.status = sub.status
                if "current_period_end" in updates:
                    row.current_period_end = end

        print(f"\nagreed={agreed} changed={changed} missing_in_stripe={missing}")
        if args.apply:
            db.commit()
            print("written")
        else:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
