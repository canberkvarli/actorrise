#!/usr/bin/env python
"""
Reconcile user_subscriptions against Stripe.

Checkout used to write `status = "active"` unconditionally and never write
`trial_end`, so every trial has been stored as a paying customer since the card
was saved. The admin page renders those two fields faithfully, which means it
has been reporting trials as active subscriptions — not a display bug, a data
one. webhooks.py now syncs both from Stripe on every event, but rows written
before that fix stay wrong until their subscription next changes, and a trial
that nobody touches does not change for two weeks.

Known wrong as of 2026-09-17: user 2967 (stored active, Stripe says trialing
until 1 October) and the three stale rows in the 2026-09-16 brief — users 333,
648 and 790, whose period_end sat in June/July or NULL.

Reads every row with a stripe_subscription_id, asks Stripe what that
subscription actually is, and reports the differences. Writes nothing without
--apply.

Usage:
    uv run python scripts/reconcile_subscriptions_with_stripe.py          # dry run
    uv run python scripts/reconcile_subscriptions_with_stripe.py --apply
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import stripe

from app.api.webhooks import _sync_from_stripe_subscription
from app.core.database import SessionLocal
from app.models.billing import UserSubscription

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

FIELDS = ("status", "trial_end", "current_period_start", "current_period_end")


def main() -> None:
    apply = "--apply" in sys.argv
    if not stripe.api_key:
        print("STRIPE_SECRET_KEY is not set; cannot reconcile.")
        sys.exit(1)

    db = SessionLocal()
    changed = missing = 0
    try:
        rows = (
            db.query(UserSubscription)
            .filter(UserSubscription.stripe_subscription_id.isnot(None))
            .all()
        )
        print(f"Checking {len(rows)} subscriptions against Stripe.\n")
        for sub in rows:
            try:
                stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
            except Exception as e:
                print(f"  user {sub.user_id}: Stripe lookup failed ({e})")
                missing += 1
                continue

            before = {f: getattr(sub, f) for f in FIELDS}
            _sync_from_stripe_subscription(sub, stripe_sub)
            diffs = {
                f: (before[f], getattr(sub, f))
                for f in FIELDS
                if before[f] != getattr(sub, f)
            }
            if not diffs:
                continue
            changed += 1
            print(f"  user {sub.user_id} ({sub.stripe_subscription_id})")
            for field, (old, new) in diffs.items():
                print(f"      {field}: {old} -> {new}")
            if not apply:
                # Drop the in-memory edits so a dry run cannot be committed by
                # something else later in the session.
                for field, (old, _new) in diffs.items():
                    setattr(sub, field, old)

        if apply:
            db.commit()
            print(f"\nUpdated {changed} subscriptions.")
        else:
            db.rollback()
            print(f"\nDry run. {changed} would change, {missing} unreadable.")
            print("Re-run with --apply to write them.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
