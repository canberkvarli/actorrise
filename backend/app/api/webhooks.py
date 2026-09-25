"""
Webhook handlers for Stripe and Resend.

Stripe: subscription management (checkout, invoices, cancellations)
Resend: email delivery tracking (delivered, opened, clicked, bounced)

All webhook handlers are idempotent to handle duplicate events.
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone

import stripe
from app.core.database import get_db
from app.models.billing import BillingHistory, PricingTier, UserSubscription
from app.models.email_tracking import EmailSend
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")


@router.post("/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Stripe webhook events.

    Verifies webhook signature and processes events:
    - checkout.session.completed
    - invoice.paid
    - invoice.payment_failed
    - customer.subscription.updated
    - customer.subscription.deleted

    All handlers are idempotent.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header or not webhook_secret:
        raise HTTPException(status_code=400, detail="Missing signature or webhook secret")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle different event types
    event_type = event["type"]
    event_data = event["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            handle_checkout_completed(event_data, db)
        elif event_type == "invoice.paid":
            handle_invoice_paid(event_data, db)
        elif event_type == "invoice.payment_failed":
            handle_payment_failed(event_data, db)
        elif event_type == "customer.subscription.created":
            handle_subscription_created(event["data"]["object"], db)

        elif event_type == "customer.subscription.updated":
            # previous_attributes is how Stripe says "the trial just ended":
            # status was trialing, now it is something else.
            handle_subscription_updated(
                event_data, db, previous_attributes=event["data"].get("previous_attributes")
            )
        elif event_type == "customer.subscription.trial_will_end":
            # Stripe fires this 3 days before the card is charged — the last
            # window in which a word from me can still change the outcome.
            handle_trial_will_end(event_data, db)
        elif event_type == "customer.subscription.deleted":
            handle_subscription_deleted(event_data, db)
        else:
            print(f"Unhandled event type: {event_type}")

        return {"status": "success"}

    except Exception as e:
        logger.exception("Error handling webhook: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed",
        ) from e


# ============================================================================
# Event Handlers
# ============================================================================


def _sync_from_stripe_subscription(subscription: UserSubscription, stripe_sub: dict) -> None:
    """Copy Stripe's own view of a subscription onto our row.

    Checkout used to hardcode `status = "active"`, so a 14-day trial was stored
    as a paying customer from the moment the card was saved, with `trial_end`
    left NULL. Nothing downstream could then tell a trial from a subscription —
    not the admin page (which renders these fields faithfully), not the revenue
    counts, not a founder looking at the table. Stripe already knows all of it,
    so ask it rather than guess.

    Never raises: a telemetry-shaped failure must not 500 a webhook and make
    Stripe retry a grant we have already applied.
    """
    try:
        if stripe_sub.get("status"):
            subscription.status = stripe_sub["status"]
        for field, key in (
            ("trial_end", "trial_end"),
            ("current_period_start", "current_period_start"),
            ("current_period_end", "current_period_end"),
        ):
            ts = stripe_sub.get(key)
            if ts is None and key.startswith("current_period"):
                # Stripe moved the period fields onto the subscription ITEM in
                # recent API versions; the subscription still carries them on
                # older ones. Read whichever is present.
                items = (stripe_sub.get("items") or {}).get("data") or []
                ts = items[0].get(key) if items else None
            if ts:
                setattr(subscription, field, datetime.fromtimestamp(ts, timezone.utc))
        if stripe_sub.get("cancel_at_period_end") is not None:
            subscription.cancel_at_period_end = stripe_sub["cancel_at_period_end"]
    except Exception as e:  # pragma: no cover - defensive
        print(f"Warning: could not sync subscription from Stripe: {e}")


def handle_checkout_completed(session: dict, db: Session):
    """
    Handle successful checkout.

    Creates or updates UserSubscription with subscription details.
    Also adds paid users to do-not-contact list automatically.
    """
    meta = session.get("metadata") or {}
    if meta.get("user_id"):
        # App checkout flow — metadata carries the user/tier mapping.
        user_id = int(meta["user_id"])
        tier_id = int(meta["tier_id"])
        billing_period = meta.get("billing_period") or "monthly"
    else:
        # Stripe Payment Link checkout (e.g. the FOUNDER3 trial link): Stripe
        # sets no app metadata, so match the user by the email they entered and
        # default to the Plus tier (the only tier sold via payment link).
        from app.models.user import User
        from sqlalchemy import func as _func

        email = (
            (session.get("customer_details") or {}).get("email")
            or session.get("customer_email")
            or ""
        ).strip().lower()
        user = (
            db.query(User).filter(_func.lower(User.email) == email).first()
            if email
            else None
        )
        if not user:
            print(
                f"⚠️ checkout.session.completed without user_id metadata and no "
                f"user match for email={email!r}; skipping"
            )
            return
        plus_tier = db.query(PricingTier).filter(PricingTier.name == "plus").first()
        if not plus_tier:
            print("⚠️ Plus tier not found; cannot map payment-link checkout")
            return
        user_id = user.id
        tier_id = plus_tier.id
        # Infer monthly vs annual from the subscription's price interval.
        billing_period = "annual"
        try:
            sub = stripe.Subscription.retrieve(session["subscription"])
            interval = sub["items"]["data"][0]["price"]["recurring"]["interval"]
            billing_period = "annual" if interval == "year" else "monthly"
        except Exception:
            pass
        print(f"✅ Payment-link checkout matched to user {user_id} ({email}) → Plus")

    # Get or create subscription
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()

    if not subscription:
        subscription = UserSubscription(user_id=user_id, source="stripe")
        db.add(subscription)

    # Update subscription
    subscription.tier_id = tier_id
    subscription.status = "active"
    subscription.billing_period = billing_period
    subscription.stripe_customer_id = session["customer"]
    subscription.stripe_subscription_id = session["subscription"]

    # A checkout that opens a trial is NOT a paying customer yet. Ask Stripe what
    # this subscription actually is (trialing vs active, and until when) instead
    # of leaving the "active" above standing. Falls back to it if the retrieve
    # fails, which is the old behaviour and never worse than it.
    trial_end_dt = None
    try:
        _stripe_sub = stripe.Subscription.retrieve(session["subscription"])
        _sync_from_stripe_subscription(subscription, _stripe_sub)
        trial_end_dt = subscription.trial_end
    except Exception as e:
        print(f"Warning: could not read Stripe subscription at checkout: {e}")

    db.commit()

    # No community event here. "Maya went Plus" was social proof for the paywall,
    # but it published a user's billing status next to their name, city, and
    # headshot. Rehearsal activity belongs in the feed; who is paying does not.

    print(f"✅ Checkout completed for user {user_id} - {billing_period} subscription")

    # GA4: the money path. Fired here rather than in the browser because the
    # success page is one closed tab away from never loading, and ad blockers
    # eat client-side purchase events. Never allowed to raise: a failure here
    # would 500 the webhook, Stripe would retry, and the plan would be granted
    # twice.
    try:
        from app.services.analytics import track_trial_started

        trial_days = int(meta.get("trial_days") or 0)
        if trial_days == 0:
            # Payment-link checkouts (the reply-CURTAIN flow) carry no app
            # metadata at all, but they do run a real trial. Recover its length
            # from the subscription so those conversions are not invisible.
            try:
                _sub = stripe.Subscription.retrieve(session["subscription"])
                start, end = _sub.get("trial_start"), _sub.get("trial_end")
                if start and end:
                    trial_days = round((end - start) / 86400)
            except Exception:
                pass

        if trial_days > 0:
            tier_row = db.query(PricingTier).filter(PricingTier.id == tier_id).first()
            track_trial_started(
                user_id=user_id,
                tier=tier_row.name if tier_row else "plus",
                trial_days=trial_days,
                value=(tier_row.monthly_price_cents / 100) if tier_row else 0.0,
                ga_client_id=meta.get("ga_client_id"),
            )
    except Exception as e:
        print(f"Warning: GA4 trial_started not sent: {e}")

    # Auto-add paid users to do-not-contact list
    try:
        from app.models.email_do_not_contact import EmailDoNotContact
        from app.models.user import User

        user = db.query(User).filter(User.id == user_id).first()
        tier = db.query(PricingTier).filter(PricingTier.id == tier_id).first()

        if user and tier and tier.name != "free":
            email_addr = (user.email or "").strip().lower()
            if email_addr:
                # Check if already on DNC
                existing = db.query(EmailDoNotContact).filter(
                    EmailDoNotContact.email == email_addr
                ).first()
                if not existing:
                    db.add(EmailDoNotContact(
                        email=email_addr,
                        name=user.name,
                        reason="paid_subscriber",
                    ))
                    db.commit()
                    print(f"✅ Auto-added {email_addr} to do-not-contact (paid subscriber)")

            # Send upgrade notification to admin (fire-and-forget).
            # trial_end is passed so the mail can say "trial started, converts
            # on the 1st" rather than "New upgrade" for somebody who has paid
            # nothing yet — the subject line that made a 14-day trial read as a
            # sale.
            from app.services.email.notifications import send_upgrade_notification

            threading.Thread(
                target=send_upgrade_notification,
                kwargs={
                    "user_name": user.name or "",
                    "user_email": user.email,
                    "tier_display_name": tier.display_name,
                    "billing_period": billing_period,
                    "trial_end": trial_end_dt,
                },
                daemon=True,
            ).start()
    except Exception as e:
        print(f"Warning: Could not process post-checkout tasks: {e}")


def handle_invoice_paid(invoice: dict, db: Session):
    """
    Handle successful payment.

    Updates subscription dates and creates billing history record.
    """
    customer_id = invoice["customer"]

    # Find user by Stripe customer ID
    subscription = (
        db.query(UserSubscription).filter(UserSubscription.stripe_customer_id == customer_id).first()
    )

    if not subscription:
        print(f"⚠️  No subscription found for customer {customer_id}")
        return

    # Update subscription dates
    subscription.current_period_start = datetime.fromtimestamp(invoice["period_start"])
    subscription.current_period_end = datetime.fromtimestamp(invoice["period_end"])
    subscription.status = "active"

    # Check if billing history already exists (idempotency)
    existing = (
        db.query(BillingHistory).filter(BillingHistory.stripe_invoice_id == invoice["id"]).first()
    )

    # Whether any real money has landed for this user before now. Computed
    # before the insert below, because afterwards the answer is always "yes".
    had_prior_payment = (
        db.query(BillingHistory)
        .filter(
            BillingHistory.user_id == subscription.user_id,
            BillingHistory.amount_cents > 0,
        )
        .first()
        is not None
    )

    if not existing:
        # Create billing history record
        billing_record = BillingHistory(
            user_id=subscription.user_id,
            amount_cents=invoice["amount_paid"],
            currency=invoice["currency"],
            status="succeeded",
            description=f"Subscription payment - {invoice['lines']['data'][0]['description'] if invoice.get('lines') else 'Subscription'}",
            stripe_invoice_id=invoice["id"],
            invoice_url=invoice.get("hosted_invoice_url"),
            invoice_pdf_url=invoice.get("invoice_pdf"),
        )
        db.add(billing_record)

    db.commit()

    print(f"✅ Invoice paid for user {subscription.user_id} - ${invoice['amount_paid']/100:.2f}")

    # GA4: a trial that survived to a real charge. Guarded on "first money ever"
    # so renewals in month three do not keep re-reporting the same conversion,
    # and on the subscription having actually had a trial, so someone who paid
    # up front is not miscounted as a converted trialist.
    try:
        if invoice.get("amount_paid", 0) > 0 and not had_prior_payment:
            # `invoice.subscription` left the top level in API 2025-03-31
            # (basil); the endpoint runs 2025-12-15. Reading it raised a
            # KeyError that the except below swallowed, so the first real
            # trial conversion (user 735, 2026-09-09, $12, cancelled two
            # hours later as "too expensive") wrote no event and no GA4 hit.
            parent = invoice.get("parent") or {}
            sub_id = (
                invoice.get("subscription")
                or (parent.get("subscription_details") or {}).get("subscription")
                or subscription.stripe_subscription_id
            )
            if not sub_id:
                raise KeyError("invoice has no subscription id")
            stripe_sub = stripe.Subscription.retrieve(sub_id)
            if stripe_sub.get("trial_end"):
                from app.services.analytics import track_trial_converted

                tier_row = (
                    db.query(PricingTier)
                    .filter(PricingTier.id == subscription.tier_id)
                    .first()
                )
                track_trial_converted(
                    user_id=subscription.user_id,
                    tier=tier_row.name if tier_row else "plus",
                    value=invoice["amount_paid"] / 100,
                    currency=(invoice.get("currency") or "usd").upper(),
                    ga_client_id=(stripe_sub.get("metadata") or {}).get("ga_client_id"),
                )
                # The same moment, in our own database, so trial-to-paid is a
                # query and not a GA4 report nobody trusts.
                from app.services.events import record_trial_ended, record_user_event

                _sid = stripe_sub.get("id") or sub_id
                _tier = tier_row.name if tier_row else "plus"
                record_user_event(
                    subscription.user_id,
                    "trial_converted",
                    {
                        "subscription_id": _sid,
                        "tier": _tier,
                        "amount_cents": invoice["amount_paid"],
                        "currency": invoice.get("currency") or "usd",
                    },
                )
                record_trial_ended(db, subscription.user_id, _sid, "converted", tier=_tier)
    except Exception as e:
        # logger, not print: this warning went unread for five months.
        logger.warning("trial_converted not recorded for user %s: %s", subscription.user_id, e)


def handle_payment_failed(invoice: dict, db: Session):
    """
    Handle failed payment.

    Marks subscription as past_due and creates billing history record.
    """
    customer_id = invoice["customer"]

    subscription = (
        db.query(UserSubscription).filter(UserSubscription.stripe_customer_id == customer_id).first()
    )

    if not subscription:
        print(f"⚠️  No subscription found for customer {customer_id}")
        return

    # Mark subscription as past due
    subscription.status = "past_due"

    # Check if billing history already exists (idempotency)
    existing = (
        db.query(BillingHistory).filter(BillingHistory.stripe_invoice_id == invoice["id"]).first()
    )

    if not existing:
        # Create billing history record
        billing_record = BillingHistory(
            user_id=subscription.user_id,
            amount_cents=invoice["amount_due"],
            currency=invoice["currency"],
            status="failed",
            description=f"Payment failed - {invoice['lines']['data'][0]['description'] if invoice.get('lines') else 'Subscription'}",
            stripe_invoice_id=invoice["id"],
            invoice_url=invoice.get("hosted_invoice_url"),
        )
        db.add(billing_record)

    db.commit()

    print(f"❌ Payment failed for user {subscription.user_id}")


def handle_subscription_created(stripe_subscription: dict, db: Session):
    """A subscription appeared in Stripe that this app has never seen.

    Stripe has been sending this event all along -- it is in the endpoint's
    enabled_events -- and the elif chain had no branch for it, so it fell
    through and returned 200. Every one counted as delivered.

    It matters for subscriptions made OUTSIDE checkout, which is how a comp is
    granted from the Stripe dashboard: there is no checkout.session, so
    handle_checkout_completed never runs and no row is ever written. Chloe Chan
    and Louis Cunningham were both active in Stripe and missing here for four
    months; Chloe read as FREE in the product throughout.

    Idempotent: checkout fires this event too, and whichever lands second must
    not write a twin.
    """
    from app.models.user import User
    from app.services.stripe_sync import resolve_subscription_owner

    sub_id = stripe_subscription.get("id")
    existing = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == sub_id)
        .first()
    )
    if existing:
        _sync_from_stripe_subscription(existing, stripe_subscription)
        db.commit()
        print(f"✅ subscription.created: {sub_id} already known, synced")
        return

    customer_id = stripe_subscription.get("customer")

    # Whoever we have already seen paying under this customer id.
    by_customer_id = {
        row[0]: row[1]
        for row in db.query(
            UserSubscription.stripe_customer_id, UserSubscription.user_id
        ).filter(UserSubscription.stripe_customer_id.isnot(None)).all()
    }

    # Falling back to the email on the Stripe customer, as the payment-link
    # branch of handle_checkout_completed already does.
    customer_email = None
    try:
        import stripe as _stripe

        customer_email = (_stripe.Customer.retrieve(customer_id) or {}).get("email")
    except Exception as exc:  # noqa: BLE001
        print(f"⚠️  subscription.created: could not read customer {customer_id}: {exc}")

    by_email = {}
    if customer_email:
        u = (
            db.query(User)
            .filter(_func.lower(User.email) == customer_email.strip().lower())
            .first()
        )
        if u:
            by_email[customer_email.strip().lower()] = u.id

    user_id = resolve_subscription_owner(
        customer_id=customer_id,
        customer_email=customer_email,
        by_customer_id=by_customer_id,
        by_email=by_email,
    )
    if user_id is None:
        # Deliberately loud and deliberately does nothing else. Attaching a
        # subscription to a guessed account hands a stranger someone's
        # membership.
        print(
            f"⚠️  subscription.created: no account for {sub_id} "
            f"(customer={customer_id}, email={customer_email!r}); no row written"
        )
        return

    plus_tier = db.query(PricingTier).filter(PricingTier.name == "plus").first()
    if not plus_tier:
        print("⚠️  subscription.created: no 'plus' tier configured; no row written")
        return

    row = UserSubscription(
        user_id=user_id,
        tier_id=plus_tier.id,
        stripe_customer_id=customer_id,
        stripe_subscription_id=sub_id,
        status=stripe_subscription.get("status", "active"),
    )
    _sync_from_stripe_subscription(row, stripe_subscription)
    db.add(row)
    db.commit()
    print(f"✅ subscription.created: wrote row for user {user_id} ({sub_id})")


def handle_subscription_updated(
    stripe_subscription: dict, db: Session, previous_attributes: dict | None = None
):
    """
    Handle subscription changes (upgrades, downgrades, cancellations).

    Updates subscription status and cancellation details. When the previous
    status was `trialing`, this event IS the trial ending: records trial_ended
    with the outcome Stripe moved it to.
    """
    subscription = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == stripe_subscription["id"])
        .first()
    )

    if not subscription:
        print(f"⚠️  No subscription found for Stripe subscription {stripe_subscription['id']}")
        return

    # Update subscription status, and the dates alongside it: a row that says
    # "trialing" with a NULL trial_end is no more readable than one that lied
    # about the status.
    _sync_from_stripe_subscription(subscription, stripe_subscription)

    if stripe_subscription.get("canceled_at"):
        subscription.canceled_at = datetime.fromtimestamp(stripe_subscription["canceled_at"])

    db.commit()

    print(
        f"✅ Subscription updated for user {subscription.user_id} - status: {stripe_subscription['status']}"
    )

    # Trial just ended (trialing -> active | past_due | canceled | ...).
    try:
        prev_status = (previous_attributes or {}).get("status")
        new_status = stripe_subscription.get("status")
        if prev_status == "trialing" and new_status and new_status != "trialing":
            from app.services.events import record_trial_ended, trial_outcome

            outcome = trial_outcome(new_status)
            record_trial_ended(
                db,
                subscription.user_id,
                stripe_subscription.get("id"),
                outcome,
                stripe_status=new_status,
            )

            # Tell me. A conversion used to arrive in silence — invoice.paid
            # notifies nobody — so the only money event that matters was the
            # one event I never heard about.
            user = db.query(User).filter(User.id == subscription.user_id).first()
            tier = (
                db.query(PricingTier)
                .filter(PricingTier.id == subscription.tier_id)
                .first()
            )
            if user:
                from app.services.email.notifications import (
                    send_trial_ended_notification,
                )

                threading.Thread(
                    target=send_trial_ended_notification,
                    kwargs={
                        "user_name": user.name or "",
                        "user_email": user.email,
                        "tier_display_name": tier.display_name if tier else "Plus",
                        "outcome": outcome,
                        "stripe_status": new_status,
                    },
                    daemon=True,
                ).start()
    except Exception as e:
        print(f"Warning: trial_ended not recorded: {e}")


def handle_trial_will_end(stripe_subscription: dict, db: Session):
    """Stripe's 3-day warning before a trial converts.

    Notification only — nothing about the subscription changes here, and the
    trial may still convert, cancel or fail. The point is the window: three days
    is long enough to ask an actor how it is going, and after the charge the
    same message reads as an apology.
    """
    subscription = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == stripe_subscription["id"])
        .first()
    )
    if not subscription:
        print(f"⚠️  trial_will_end for unknown subscription {stripe_subscription['id']}")
        return

    # Keep the stored dates honest while we are here.
    _sync_from_stripe_subscription(subscription, stripe_subscription)
    db.commit()

    user = db.query(User).filter(User.id == subscription.user_id).first()
    tier = db.query(PricingTier).filter(PricingTier.id == subscription.tier_id).first()
    if not user:
        return

    from app.services.email.notifications import send_trial_ending_notification

    threading.Thread(
        target=send_trial_ending_notification,
        kwargs={
            "user_name": user.name or "",
            "user_email": user.email,
            "tier_display_name": tier.display_name if tier else "Plus",
            "trial_end": subscription.trial_end,
        },
        daemon=True,
    ).start()
    print(f"✅ trial_will_end notified for user {subscription.user_id}")


def handle_subscription_deleted(stripe_subscription: dict, db: Session):
    """
    Handle subscription cancellation.

    Moves user back to free tier when subscription ends.
    """
    subscription = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == stripe_subscription["id"])
        .first()
    )

    if not subscription:
        print(f"⚠️  No subscription found for Stripe subscription {stripe_subscription['id']}")
        return

    # GA4: churn that happened before a single charge. Read the tier now, while
    # it still says plus/pro — the block below overwrites it with free.
    try:
        trial_end = stripe_subscription.get("trial_end")
        ended_at = stripe_subscription.get("ended_at") or stripe_subscription.get(
            "canceled_at"
        )
        # A day of slack: subscriptions killed by "no payment method at trial
        # end" land fractionally after trial_end but never took any money.
        if trial_end and ended_at and ended_at <= trial_end + 86400:
            from app.services.analytics import track_trial_cancelled

            tier_row = (
                db.query(PricingTier)
                .filter(PricingTier.id == subscription.tier_id)
                .first()
            )
            trial_start = stripe_subscription.get("trial_start")
            days_into_trial = round((ended_at - trial_start) / 86400) if trial_start else None
            track_trial_cancelled(
                user_id=subscription.user_id,
                tier=tier_row.name if tier_row else "plus",
                days_into_trial=days_into_trial,
                ga_client_id=(stripe_subscription.get("metadata") or {}).get(
                    "ga_client_id"
                ),
            )
            from app.services.events import record_trial_ended

            record_trial_ended(
                db,
                subscription.user_id,
                stripe_subscription.get("id"),
                "cancelled",
                tier=tier_row.name if tier_row else "plus",
                days_into_trial=days_into_trial,
            )
    except Exception as e:
        print(f"Warning: GA4 trial_cancelled not sent: {e}")

    # Move user to free tier
    free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()

    if free_tier:
        subscription.tier_id = free_tier.id
        subscription.status = "canceled"
        subscription.canceled_at = datetime.now()

    db.commit()

    print(f"✅ Subscription canceled for user {subscription.user_id} - moved to free tier")


# ============================================================================
# Resend Webhook Handler
# ============================================================================

resend_webhook_secret = os.getenv("RESEND_WEBHOOK_SECRET")


@router.post("/resend")
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Handle Resend webhook events for email tracking.

    Tracks: delivered, opened, clicked, bounced, complained.
    Verifies signature using Svix if RESEND_WEBHOOK_SECRET is set.
    """
    payload = await request.body()

    # Verify webhook signature if secret is configured
    if resend_webhook_secret:
        try:
            from svix.webhooks import Webhook
            wh = Webhook(resend_webhook_secret)
            wh.verify(payload, {
                "svix-id": request.headers.get("svix-id", ""),
                "svix-timestamp": request.headers.get("svix-timestamp", ""),
                "svix-signature": request.headers.get("svix-signature", ""),
            })
        except ImportError:
            logger.warning("svix not installed, skipping webhook verification")
        except Exception as e:
            logger.warning("Resend webhook signature verification failed: %s", e)
            return JSONResponse(status_code=400, content={"error": "Invalid signature"})

    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    event_type = event.get("type", "")
    data = event.get("data", {})
    email_id = data.get("email_id")

    if not email_id:
        return {"status": "ok", "message": "no email_id"}

    # Find the matching EmailSend row
    send = db.query(EmailSend).filter(EmailSend.resend_email_id == email_id).first()
    if not send:
        return {"status": "ok", "message": "email_id not tracked"}

    now = datetime.utcnow()

    if event_type == "email.delivered":
        send.status = "delivered"
    elif event_type == "email.opened":
        send.status = "opened"
        if not send.opened_at:
            send.opened_at = now
    elif event_type == "email.clicked":
        send.status = "clicked"
        if not send.clicked_at:
            send.clicked_at = now
    elif event_type == "email.bounced":
        send.status = "bounced"
        _suppress(db, send.to_email, "bounced")
    elif event_type == "email.complained":
        send.status = "bounced"
        _suppress(db, send.to_email, "complained")
    else:
        return {"status": "ok", "message": f"unhandled event: {event_type}"}

    db.commit()
    return {"status": "ok"}


def _suppress(db: Session, email: str | None, reason: str) -> None:
    """Add a hard-bounced/complained address to the do-not-contact list so it's
    never mailed again. Idempotent: skips if already present. Non-fatal."""
    from app.models.email_do_not_contact import EmailDoNotContact

    addr = (email or "").strip().lower()
    if not addr:
        return
    try:
        existing = db.query(EmailDoNotContact).filter(
            EmailDoNotContact.email == addr
        ).first()
        if not existing:
            db.add(EmailDoNotContact(email=addr, reason=reason))
    except Exception as e:  # never let suppression break webhook ack
        logger.warning("Failed to suppress %s (%s): %s", addr, reason, e)


# ============================================================================
# RevenueCat Webhook Handler (Ghost Light iOS — spec §4 #3)
# ============================================================================

revenuecat_webhook_auth = os.getenv("REVENUECAT_WEBHOOK_AUTH")

# RevenueCat's app_user_id is set to the Supabase user id at login, so it maps
# straight onto users.supabase_id. The mobile Monologues tier is granted/revoked
# entirely from these events — the App Store, not Stripe, is the source of truth
# for iOS subscriptions.
_RC_GRANT_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
}


def _rc_find_user(event: dict, db: Session):
    """Match a RevenueCat event to our user via supabase_id. Checks app_user_id
    first, then aliases (RevenueCat may carry an earlier anonymous id)."""
    candidates = []
    if event.get("app_user_id"):
        candidates.append(event["app_user_id"])
    candidates.extend(event.get("aliases", []) or [])
    for rc_id in candidates:
        user = db.query(User).filter(User.supabase_id == str(rc_id)).first()
        if user:
            return user
    return None


def _rc_get_or_create_subscription(user_id: int, db: Session) -> UserSubscription:
    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == user_id)
        .first()
    )
    if not sub:
        free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
        sub = UserSubscription(
            user_id=user_id,
            tier_id=free_tier.id if free_tier else 1,
            status="active",
            source="revenuecat",
        )
        db.add(sub)
    return sub


@router.post("/revenuecat")
async def revenuecat_webhook(request: Request, db: Session = Depends(get_db)):
    """Grant/revoke the mobile Monologues tier from RevenueCat events.

    RevenueCat authenticates with a static bearer set in its dashboard; we check
    it against REVENUECAT_WEBHOOK_AUTH. INITIAL_PURCHASE/RENEWAL grant the tier;
    EXPIRATION revokes to free. CANCELLATION only flags auto-renew off — access
    is kept until the purchase actually EXPIRES, so a user who cancels still gets
    what they paid for (this is the one place we read the spec's 'revoke on
    cancellation' as 'stop renewing', not 'cut off now')."""
    if revenuecat_webhook_auth:
        if request.headers.get("Authorization") != revenuecat_webhook_auth:
            raise HTTPException(status_code=401, detail="Invalid webhook auth")
    else:
        logger.warning("REVENUECAT_WEBHOOK_AUTH not set — webhook is unauthenticated")

    try:
        body = json.loads(await request.body())
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    event = body.get("event") or {}
    event_type = event.get("type", "")

    user = _rc_find_user(event, db)
    if not user:
        # Ack so RevenueCat doesn't retry forever for an id we'll never know.
        logger.warning("RevenueCat %s for unknown app_user_id %s", event_type, event.get("app_user_id"))
        return {"status": "ok", "message": "user not found"}

    sub = _rc_get_or_create_subscription(int(user.id), db)

    if event_type in _RC_GRANT_EVENTS:
        tier = db.query(PricingTier).filter(PricingTier.name == "monologues").first()
        if not tier:
            logger.error("Monologues tier not seeded — cannot grant RevenueCat entitlement")
            return {"status": "ok", "message": "monologues tier missing"}
        sub.tier_id = tier.id
        sub.status = "active"
        sub.cancel_at_period_end = False
        sub.canceled_at = None
        period = event.get("period_type")
        sub.billing_period = "annual" if event.get("expiration_at_ms") and period == "NORMAL" else sub.billing_period
        exp_ms = event.get("expiration_at_ms")
        if exp_ms:
            sub.current_period_end = datetime.utcfromtimestamp(int(exp_ms) / 1000)
        db.commit()
        logger.info("RevenueCat %s → granted Monologues to user %s", event_type, user.id)

    elif event_type == "CANCELLATION":
        # Auto-renew off; keep the tier until EXPIRATION.
        sub.cancel_at_period_end = True
        sub.canceled_at = datetime.now()
        db.commit()

    elif event_type == "EXPIRATION":
        free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
        if free_tier:
            sub.tier_id = free_tier.id
        sub.status = "expired"
        db.commit()
        logger.info("RevenueCat EXPIRATION → revoked Monologues from user %s", user.id)

    elif event_type == "BILLING_ISSUE":
        # Grace: keep the tier, flag the trouble so a renewal can clear it.
        sub.status = "past_due"
        db.commit()

    else:
        return {"status": "ok", "message": f"unhandled event: {event_type}"}

    return {"status": "ok"}
