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
from datetime import datetime

import stripe
from app.core.database import get_db
from app.models.billing import BillingHistory, PricingTier, UserSubscription
from app.models.email_tracking import EmailSend
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
        elif event_type == "customer.subscription.updated":
            handle_subscription_updated(event_data, db)
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
        subscription = UserSubscription(user_id=user_id)
        db.add(subscription)

    # Update subscription
    subscription.tier_id = tier_id
    subscription.status = "active"
    subscription.billing_period = billing_period
    subscription.stripe_customer_id = session["customer"]
    subscription.stripe_subscription_id = session["subscription"]

    db.commit()

    # Green Room: "Maya went Plus" — social proof for the paywall. Safe/no-throw.
    from app.services.community import record_event
    record_event(user_id, "went_plus")

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

            # Send upgrade notification to admin (fire-and-forget)
            from app.services.email.notifications import send_upgrade_notification

            threading.Thread(
                target=send_upgrade_notification,
                kwargs={
                    "user_name": user.name or "",
                    "user_email": user.email,
                    "tier_display_name": tier.display_name,
                    "billing_period": billing_period,
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
            stripe_sub = stripe.Subscription.retrieve(invoice["subscription"])
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
    except Exception as e:
        print(f"Warning: GA4 trial_converted not sent: {e}")


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


def handle_subscription_updated(stripe_subscription: dict, db: Session):
    """
    Handle subscription changes (upgrades, downgrades, cancellations).

    Updates subscription status and cancellation details.
    """
    subscription = (
        db.query(UserSubscription)
        .filter(UserSubscription.stripe_subscription_id == stripe_subscription["id"])
        .first()
    )

    if not subscription:
        print(f"⚠️  No subscription found for Stripe subscription {stripe_subscription['id']}")
        return

    # Update subscription status
    subscription.status = stripe_subscription["status"]
    subscription.cancel_at_period_end = stripe_subscription["cancel_at_period_end"]

    if stripe_subscription.get("canceled_at"):
        subscription.canceled_at = datetime.fromtimestamp(stripe_subscription["canceled_at"])

    db.commit()

    print(
        f"✅ Subscription updated for user {subscription.user_id} - status: {stripe_subscription['status']}"
    )


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
            track_trial_cancelled(
                user_id=subscription.user_id,
                tier=tier_row.name if tier_row else "plus",
                days_into_trial=(
                    round((ended_at - trial_start) / 86400) if trial_start else None
                ),
                ga_client_id=(stripe_subscription.get("metadata") or {}).get(
                    "ga_client_id"
                ),
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
