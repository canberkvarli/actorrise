"""
Marketing email service.

Handles targeted campaign sending with opt-in verification
and unsubscribe token management.
"""

import hashlib
import hmac
import os
import threading
from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.billing import PricingTier, UsageMetrics, UserSubscription
from app.models.user import User
from app.services.email.resend_client import ResendEmailClient
from app.services.email.templates import EmailTemplates


# ---------------------------------------------------------------------------
# Unsubscribe token helpers
# ---------------------------------------------------------------------------

def _get_signing_key() -> str:
    """Return signing key for unsubscribe tokens (uses RESEND_API_KEY)."""
    key = os.getenv("RESEND_API_KEY", "")
    if not key:
        raise ValueError("RESEND_API_KEY required for unsubscribe tokens")
    return key


def generate_unsubscribe_token(email: str) -> str:
    """Create an HMAC-SHA256 token for the given email."""
    return hmac.new(
        _get_signing_key().encode(),
        email.lower().encode(),
        hashlib.sha256,
    ).hexdigest()


def verify_unsubscribe_token(email: str, token: str) -> bool:
    """Check that *token* is valid for *email*."""
    expected = generate_unsubscribe_token(email)
    return hmac.compare_digest(expected, token)


def build_unsubscribe_url(email: str) -> str:
    """Build the full unsubscribe URL for a user."""
    token = generate_unsubscribe_token(email)
    base = os.getenv("SITE_URL", "https://actorrise.com")
    return f"{base}/unsubscribe?email={email}&token={token}"


# ---------------------------------------------------------------------------
# Targeting helpers
# ---------------------------------------------------------------------------

def _get_marketing_recipients(
    db: Session,
    target: str = "all",
) -> list[User]:
    """
    Query users filtered by tier. Unsubscribed users (marketing_opt_in=False)
    are excluded; everyone else is included.

    target:
        "all"  — every subscribed user
        "free" — only free-tier users
        "paid" — only users with an active paid subscription
    """
    query = db.query(User).filter(User.marketing_opt_in.is_(True))

    if target == "all":
        pass  # no additional filter
    elif target == "free":
        paid_user_ids = (
            db.query(UserSubscription.user_id)
            .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
            .filter(
                UserSubscription.status.in_(["active", "trialing"]),
                PricingTier.name != "free",
            )
            .subquery()
        )
        query = query.filter(~User.id.in_(paid_user_ids))
    elif target == "paid":
        paid_user_ids = (
            db.query(UserSubscription.user_id)
            .join(PricingTier, UserSubscription.tier_id == PricingTier.id)
            .filter(
                UserSubscription.status.in_(["active", "trialing"]),
                PricingTier.name != "free",
            )
            .subquery()
        )
        query = query.filter(User.id.in_(paid_user_ids))

    return query.all()


# ---------------------------------------------------------------------------
# Campaign senders
# ---------------------------------------------------------------------------

def send_campaign(
    db: Session,
    campaign_type: str,
    target: str = "all",
    dry_run: bool = False,
    **template_kwargs,
) -> dict:
    """
    Send a marketing campaign to opted-in users.

    Args:
        db: Database session
        campaign_type: "upgrade_nudge" | "feature_announcement" | "weekly_engagement"
        target: "all" | "free" | "paid"
        dry_run: If True, list recipients without sending
        **template_kwargs: Passed to the template render method

    Returns:
        {"sent": int, "skipped": int, "errors": list[str], "recipients": list[str]}
    """
    if not os.getenv("RESEND_API_KEY"):
        return {"sent": 0, "skipped": 0, "errors": ["RESEND_API_KEY not set"], "recipients": []}

    recipients = _get_marketing_recipients(db, target)

    result = {
        "sent": 0,
        "skipped": 0,
        "errors": [],
        "recipients": [f"{u.name}, {u.email}" if u.name else u.email for u in recipients],
    }

    if dry_run:
        return result

    client = ResendEmailClient()
    templates = EmailTemplates()

    subject_map = {
        "upgrade_nudge": "Unlock more with ActorRise Plus",
        "feature_announcement": template_kwargs.get("feature_title", "What's new on ActorRise"),
        "founder_offer": "A special offer just for you",
        "actor_page": "Your actor page on ActorRise",
        "cold_outreach": "hey from ActorRise",
        "weekly_engagement": "Your weekly pick from ActorRise",
        "scene_partner_launch": "New: rehearse lines with a scene partner that never flakes",
    }
    subject = subject_map.get(campaign_type, "News from ActorRise")

    render_map = {
        "upgrade_nudge": templates.render_upgrade_nudge,
        "feature_announcement": templates.render_feature_announcement,
        "founder_offer": templates.render_founder_offer,
        "actor_page": templates.render_actor_page,
        "cold_outreach": templates.render_cold_outreach,
        "weekly_engagement": templates.render_weekly_engagement,
        "scene_partner_launch": templates.render_scene_partner_launch,
    }
    render_fn = render_map.get(campaign_type)
    if not render_fn:
        return {"sent": 0, "skipped": 0, "errors": [f"Unknown campaign type: {campaign_type}"], "recipients": []}

    for user in recipients:
        try:
            unsub_url = build_unsubscribe_url(user.email)
            html = render_fn(
                user_name=user.name or "there",
                unsubscribe_url=unsub_url,
                **template_kwargs,
            )
            client.send_email(
                to=user.email,
                subject=subject,
                html=html,
            )
            result["sent"] += 1
        except Exception as e:
            result["errors"].append(f"{user.email}: {e}")
            result["skipped"] += 1

    return result


# ---------------------------------------------------------------------------
# Usage-aware upgrade nudge
# ---------------------------------------------------------------------------

def _get_monthly_ai_searches(db: Session, user_id: int) -> int:
    """Sum ai_searches_count for the current calendar month."""
    first_day = date.today().replace(day=1)
    result = (
        db.query(func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0))
        .filter(UsageMetrics.user_id == user_id, UsageMetrics.date >= first_day)
        .scalar()
    )
    return int(result)


def _get_ai_search_limit(db: Session, user_id: int) -> int:
    """Return the user's ai_searches_per_month limit from their tier."""
    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == user_id)
        .first()
    )
    if sub and sub.status in ("active", "trialing") and sub.tier_id:
        tier = db.query(PricingTier).get(sub.tier_id)
    else:
        tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
    if not tier:
        return 10  # safe default
    return tier.features.get("ai_searches_per_month", 10)


def _send_upgrade_nudge_campaign(db: Session, target: str, dry_run: bool) -> dict:
    """Send upgrade nudge with real per-user usage data."""
    recipients = _get_marketing_recipients(db, target)
    result: dict = {"sent": 0, "skipped": 0, "errors": [], "recipients": [f"{u.name}, {u.email}" if u.name else u.email for u in recipients]}

    if dry_run:
        for user in recipients:
            used = _get_monthly_ai_searches(db, user.id)
            limit = _get_ai_search_limit(db, user.id)
            result["recipients"].append(f"  {user.email} ({used}/{limit} searches)")
        return result

    client = ResendEmailClient()
    templates = EmailTemplates()

    for user in recipients:
        try:
            used = _get_monthly_ai_searches(db, user.id)
            limit = _get_ai_search_limit(db, user.id)
            unsub_url = build_unsubscribe_url(user.email)
            html = templates.render_upgrade_nudge(
                user_name=user.name or "there",
                searches_used=used,
                searches_limit=limit,
                unsubscribe_url=unsub_url,
            )
            client.send_email(
                to=user.email,
                subject="Unlock more with ActorRise Plus",
                html=html,
            )
            result["sent"] += 1
        except Exception as e:
            result["errors"].append(f"{user.email}: {e}")
            result["skipped"] += 1

    return result


def maybe_send_upgrade_nudge(db: Session, user_id: int) -> None:
    """
    Check if a free-tier user is at 80%+ of their AI search limit
    and send them an upgrade nudge (once per month, in a background thread).

    Call this after incrementing usage in the rate limiter.
    """
    if not os.getenv("RESEND_API_KEY"):
        return

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.marketing_opt_in:
        return

    # Only nudge free-tier users
    sub = (
        db.query(UserSubscription)
        .filter(UserSubscription.user_id == user_id)
        .first()
    )
    if sub and sub.status in ("active", "trialing"):
        tier = db.query(PricingTier).get(sub.tier_id) if sub.tier_id else None
        if tier and tier.name != "free":
            return  # paid user, skip

    limit = _get_ai_search_limit(db, user_id)
    if limit <= 0 or limit == -1:
        return  # unlimited or no feature

    used = _get_monthly_ai_searches(db, user_id)
    threshold = int(limit * 0.8)  # trigger at 80%

    # Only send exactly at the threshold crossing (not every subsequent search)
    if used != threshold:
        return

    # Fire-and-forget in background thread
    email = user.email
    name = user.name

    def _send():
        try:
            templates = EmailTemplates()
            client = ResendEmailClient()
            unsub_url = build_unsubscribe_url(email)
            html = templates.render_upgrade_nudge(
                user_name=name or "there",
                searches_used=used,
                searches_limit=limit,
                unsubscribe_url=unsub_url,
            )
            client.send_email(
                to=email,
                subject="Unlock more with ActorRise Plus",
                html=html,
            )
        except Exception as e:
            print(f"Error sending upgrade nudge to {email}: {e}")

    t = threading.Thread(target=_send, daemon=True)
    t.start()
