from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.billing import PricingTier, UserBenefitOverride, UserSubscription


def get_base_tier_features(
    db: Session,
    subscription: UserSubscription | None,
) -> dict[str, Any]:
    """Return base features from active subscription tier or free tier."""
    tier: PricingTier | None = None
    if subscription and subscription.status in ("active", "trialing"):
        tier = db.query(PricingTier).get(subscription.tier_id)
    if tier is None:
        tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
    return dict(tier.features or {}) if tier else {}


def get_effective_benefits(
    db: Session,
    user_id: int,
    subscription: UserSubscription | None,
) -> dict[str, Any]:
    """
    Resolve effective features with precedence:
      user override > subscription tier > free tier.
    """
    features = get_base_tier_features(db, subscription)
    now = datetime.now(timezone.utc)

    overrides = (
        db.query(UserBenefitOverride)
        .filter(
            UserBenefitOverride.user_id == user_id,
            (UserBenefitOverride.expires_at.is_(None)) | (UserBenefitOverride.expires_at >= now),
        )
        .order_by(UserBenefitOverride.created_at.asc(), UserBenefitOverride.id.asc())
        .all()
    )

    for override in overrides:
        if override.override_type == "revoke":
            features[override.feature_key] = False
        else:
            features[override.feature_key] = override.value

    return features
