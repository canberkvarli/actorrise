"""
Stripe webhook handlers.

Handles all Stripe webhook events for subscription management:
- checkout.session.completed: Create subscription after successful payment
- invoice.paid: Update subscription dates and create billing history
- invoice.payment_failed: Mark subscription as past_due
- customer.subscription.updated: Update subscription status
- customer.subscription.deleted: Move user back to free tier

All webhook handlers are idempotent to handle duplicate events.
"""

import logging
import os
import threading
from datetime import datetime

import stripe
from app.core.database import get_db
from app.models.billing import BillingHistory, PricingTier, UserSubscription
from fastapi import APIRouter, Depends, HTTPException, Request
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
    """
    user_id = int(session["metadata"]["user_id"])
    tier_id = int(session["metadata"]["tier_id"])
    billing_period = session["metadata"]["billing_period"]

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

    print(f"✅ Checkout completed for user {user_id} - {billing_period} subscription")

    # Send upgrade notification to admin (fire-and-forget)
    try:
        from app.models.user import User

        user = db.query(User).filter(User.id == user_id).first()
        tier = db.query(PricingTier).filter(PricingTier.id == tier_id).first()

        if user and tier and tier.name != "free":
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
        print(f"Warning: Could not send upgrade notification: {e}")


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

    # Move user to free tier
    free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()

    if free_tier:
        subscription.tier_id = free_tier.id
        subscription.status = "canceled"
        subscription.canceled_at = datetime.now()

    db.commit()

    print(f"✅ Subscription canceled for user {subscription.user_id} - moved to free tier")
