#!/usr/bin/env python
"""Backfill subscriptions that exist in Stripe and not in this database.

Why any exist: `customer.subscription.created` was in the webhook endpoint's
enabled_events and had no branch in the handler, so it fell through and returned
200 for months. Every subscription made outside a Checkout session -- which is
how a comp is granted from the Stripe dashboard -- wrote no row here. That is
fixed in webhooks.py; this catches the ones that already slipped.

Matching uses the same rule the webhook does (`stripe_sync.resolve_subscription_owner`):
customer id first, then the customer's email. No match writes NO row and says
so. Attaching a subscription to a guessed account hands a stranger someone
else's membership.

Usage:
    .venv/bin/python -m scripts.reconcile_stripe_subscriptions            # dry run
    .venv/bin/python -m scripts.reconcile_stripe_subscriptions --write
"""

import argparse
import os

from app.core.database import SessionLocal
from app.models.billing import PricingTier, UserSubscription
from app.models.user import User
from app.services.stripe_sync import resolve_subscription_owner
from sqlalchemy import func


def _client():
    """The same SDK the app uses, so the CA bundle and API version match it."""
    import stripe

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    return stripe


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="apply; otherwise dry run")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        known = {
            r[0]
            for r in db.query(UserSubscription.stripe_subscription_id)
            .filter(UserSubscription.stripe_subscription_id.isnot(None))
            .all()
        }
        by_customer_id = {
            r[0]: r[1]
            for r in db.query(
                UserSubscription.stripe_customer_id, UserSubscription.user_id
            )
            .filter(UserSubscription.stripe_customer_id.isnot(None))
            .all()
        }
        plus = db.query(PricingTier).filter(PricingTier.name == "plus").first()
        if not plus:
            print("no 'plus' tier configured; nothing can be written")
            return

        missing, written, unmatched = 0, 0, 0
        for status in ("active", "trialing", "past_due"):
            for sub in _client().Subscription.list(status=status, limit=100).data:
                if sub["id"] in known:
                    continue
                missing += 1
                cust = sub.get("customer")
                email = None
                try:
                    email = (_client().Customer.retrieve(cust) or {}).get("email")
                except Exception as exc:  # noqa: BLE001
                    print(f"  ! could not read customer {cust}: {exc}")

                by_email = {}
                if email:
                    u = (
                        db.query(User)
                        .filter(func.lower(User.email) == email.strip().lower())
                        .first()
                    )
                    if u:
                        by_email[email.strip().lower()] = u.id

                owner = resolve_subscription_owner(
                    customer_id=cust,
                    customer_email=email,
                    by_customer_id=by_customer_id,
                    by_email=by_email,
                )
                # A comp is a 100%-off discount, not a different product; say so
                # in the output because it changes how urgent a gap is.
                comped = "comp" if sub.get("discounts") else "PAYING"
                if owner is None:
                    unmatched += 1
                    print(f"  UNMATCHED {sub['id']}  {status:9} {comped:7} {email!r}")
                    continue

                # user_id is UNIQUE here: one subscription row per account,
                # ever. Louis already has one (a separate trial that is what
                # actually grants him Plus), so a second row cannot exist and
                # must not try -- and one failure inside a shared transaction
                # rolls back every other row with it.
                held = (
                    db.query(UserSubscription)
                    .filter(UserSubscription.user_id == owner)
                    .first()
                )
                if held:
                    print(f"  skip      {sub['id']}  {status:9} {comped:7} user={owner} "
                          f"already has {held.stripe_subscription_id or 'a row'} "
                          f"({held.status})")
                    continue

                print(f"  {'WRITE' if args.write else 'would write'} {sub['id']}  "
                      f"{status:9} {comped:7} user={owner} {email}")
                if args.write:
                    row = UserSubscription(
                        user_id=owner,
                        tier_id=plus.id,
                        stripe_customer_id=cust,
                        stripe_subscription_id=sub["id"],
                        status=status,
                        billing_period=(
                            "yearly"
                            if (sub["items"].data[0].price.recurring or {}).get("interval") == "year"
                            else "monthly"
                        ),
                    )
                    db.add(row)
                    try:
                        # Per row, so one collision cannot roll back the rest.
                        db.commit()
                        written += 1
                    except Exception as exc:  # noqa: BLE001
                        db.rollback()
                        print(f"  ! {sub['id']} failed: {str(exc)[:120]}")

        print(f"\nmissing from the database: {missing}   written: {written}   unmatched: {unmatched}")
        if not args.write:
            print("dry run. re-run with --write to apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
