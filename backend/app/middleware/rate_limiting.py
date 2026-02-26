"""
Feature gating and rate limiting middleware.

Provides FeatureGate dependency for protecting endpoints based on user's
subscription tier and usage limits.

Usage:
    @router.post("/api/search")
    async def search_monologues(
        ...,
        _gate: bool = Depends(FeatureGate("ai_search", increment=True))
    ):
        # FeatureGate already checked limits and incremented usage
        # Proceed with search logic
"""

from datetime import date
from typing import Callable

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.actor import UserScript
from app.models.billing import PricingTier, UsageMetrics, UserSubscription
from app.models.user import User
from app.services.benefits import get_effective_benefits
from fastapi import Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session


class FeatureGate:
    """
    Dependency for feature gating and rate limiting.

    Checks if user has access to a feature based on their subscription tier
    and current usage. Optionally increments usage counter.

    Args:
        feature: Feature name (e.g., "ai_search", "scene_partner", "craft_coach")
        increment: Whether to increment the usage counter (default: False)

    Raises:
        HTTPException 403: If user has exceeded their limit or feature not available

    Example:
        # Check and increment AI search usage
        _gate: bool = Depends(FeatureGate("ai_search", increment=True))

        # Just check if feature is available (don't increment)
        _gate: bool = Depends(FeatureGate("scene_partner", increment=False))
    """

    def __init__(self, feature: str, increment: bool = False):
        self.feature = feature
        self.increment = increment

    async def __call__(
        self, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
    ) -> bool:
        """Check if user has access to feature."""
        # Superuser bypass (e.g. local dev or admin)
        if settings.superuser_emails and current_user.email:
            emails = [e.strip().lower() for e in settings.superuser_emails.split(",") if e.strip()]
            if current_user.email.lower() in emails:
                if self.increment and self.feature == "ai_search":
                    self._increment_usage(current_user.id, "ai_searches_count", db)
                return True

        # Get user's subscription and tier
        subscription = (
            db.query(UserSubscription).filter(UserSubscription.user_id == current_user.id).first()
        )

        if subscription and subscription.status in ("active", "trialing"):
            tier = db.query(PricingTier).get(subscription.tier_id)
        else:
            # Default to Free tier
            tier = db.query(PricingTier).filter(PricingTier.name == "free").first()

        if tier is None:
            raise HTTPException(status_code=500, detail="Pricing tier not found")

        # Apply per-user overrides on top of tier defaults.
        features = get_effective_benefits(db, current_user.id, subscription)

        # Handle different feature types
        if self.feature == "ai_search":
            return await self._check_usage_limit(
                current_user.id,
                "ai_searches_count",
                features.get("ai_searches_per_month", 0),
                db,
                feature_name="AI searches",
            )

        elif self.feature == "scene_partner":
            return await self._check_usage_limit(
                current_user.id,
                "scene_partner_sessions",
                features.get("scene_partner_sessions", 0),
                db,
                feature_name="ScenePartner sessions",
            )

        elif self.feature == "craft_coach":
            return await self._check_usage_limit(
                current_user.id,
                "craft_coach_sessions",
                features.get("craft_coach_sessions", 0),
                db,
                feature_name="CraftCoach sessions",
            )

        elif self.feature == "script_upload":
            limit = features.get("scene_partner_scripts", 0)
            if limit == -1:
                return True
            if limit == 0:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "feature_not_available",
                        "message": "Script uploads are not available on your current plan. Upgrade to start uploading scripts.",
                        "upgrade_url": "/pricing",
                    },
                )
            current_count = (
                db.query(func.count(UserScript.id))
                .filter(UserScript.user_id == current_user.id)
                .scalar()
            )
            if current_count >= limit:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "script_upload_limit_exceeded",
                        "message": f"You've reached your limit of {limit} scripts. Upgrade to Plus for up to 10 scripts or Unlimited for no limits.",
                        "limit": limit,
                        "used": current_count,
                        "upgrade_url": "/pricing",
                    },
                )
            return True

        elif self.feature == "recommendations":
            # Boolean feature check
            if not features.get("recommendations", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "feature_not_available",
                        "message": "Personalized recommendations are only available on Pro and Elite plans. Upgrade to access AI-powered recommendations tailored to your profile.",
                        "upgrade_url": "/pricing",
                    },
                )

        elif self.feature == "advanced_analytics":
            if not features.get("advanced_analytics", False):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "feature_not_available",
                        "message": "Advanced analytics are only available on the Elite plan. Upgrade to access detailed insights into your monologue search patterns and performance.",
                        "upgrade_url": "/pricing",
                    },
                )

        else:
            # Unknown feature - deny by default
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "feature_not_available",
                    "message": f"Feature '{self.feature}' is not available on your current plan.",
                    "upgrade_url": "/pricing",
                },
            )

        return True

    async def _check_usage_limit(
        self,
        user_id: int,
        usage_field: str,
        limit: int,
        db: Session,
        feature_name: str,
    ) -> bool:
        """
        Check if user is within usage limits for a feature.

        Args:
            user_id: User ID
            usage_field: Field name in UsageMetrics (e.g., "ai_searches_count")
            limit: Monthly limit (-1 = unlimited, 0 = not available)
            db: Database session
            feature_name: Human-readable feature name for error messages

        Returns:
            True if user has access

        Raises:
            HTTPException 403: If limit exceeded or feature not available
        """
        # Check if feature is available at all
        if limit == 0:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "feature_not_available",
                    "message": f"{feature_name} are not available on your current plan. Upgrade to Pro or Elite to access this feature.",
                    "upgrade_url": "/pricing",
                },
            )

        # Unlimited usage
        if limit == -1:
            if self.increment:
                self._increment_usage(user_id, usage_field, db)
            return True

        # Get current month's usage
        usage = self._get_monthly_usage(user_id, usage_field, db)

        # Check if limit exceeded
        if usage >= limit:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": f"{usage_field}_limit_exceeded",
                    "message": f"You've reached your limit of {limit} {feature_name} this month. Upgrade to Pro for more searches or Elite for unlimited.",
                    "limit": limit,
                    "used": usage,
                    "upgrade_url": "/pricing",
                },
            )

        # Increment usage if requested (total_searches_count is incremented in endpoints only when there are results)
        if self.increment:
            self._increment_usage(user_id, usage_field, db)

        return True

    def _get_monthly_usage(self, user_id: int, field: str, db: Session) -> int:
        """Get user's usage for current month - OPTIMIZED with SQL SUM."""
        today = date.today()
        first_day = today.replace(day=1)

        # Use SQL SUM instead of Python aggregation (10-50x faster for heavy users)
        result = (
            db.query(func.coalesce(func.sum(getattr(UsageMetrics, field)), 0))
            .filter(UsageMetrics.user_id == user_id, UsageMetrics.date >= first_day)
            .scalar()
        )

        return int(result)

    def _increment_usage(self, user_id: int, field: str, db: Session):
        """Increment usage counter for today."""
        today = date.today()

        # Get or create today's usage record
        usage = (
            db.query(UsageMetrics)
            .filter(UsageMetrics.user_id == user_id, UsageMetrics.date == today)
            .first()
        )

        if not usage:
            usage = UsageMetrics(user_id=user_id, date=today)
            db.add(usage)

        # Increment the specified field (handle None from DB or new instance)
        current_value = getattr(usage, field, 0) or 0
        setattr(usage, field, current_value + 1)

        db.commit()


def record_total_search(user_id: int, db: Session) -> None:
    """
    Increment the total search count for today (for public "live count").
    Call from any search endpoint (e.g. film/TV search) so monologue + film/TV + etc. all count.
    """
    today = date.today()
    usage = (
        db.query(UsageMetrics)
        .filter(UsageMetrics.user_id == user_id, UsageMetrics.date == today)
        .first()
    )
    if not usage:
        usage = UsageMetrics(user_id=user_id, date=today)
        db.add(usage)
    current = getattr(usage, "total_searches_count", 0) or 0
    setattr(usage, "total_searches_count", current + 1)
    db.commit()


# Convenience functions for common features


def require_ai_search(increment: bool = True) -> Callable:
    """
    Require AI search access (and optionally increment usage).

    Usage:
        @router.post("/search")
        async def search(
            ...,
            _: bool = Depends(require_ai_search(increment=True))
        ):
            # User has access to AI search
    """
    return FeatureGate("ai_search", increment=increment)


async def require_ai_search_when_query(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> bool:
    """
    Enforce AI search limits only when the request includes a search query.

    - Superuser emails (SUPERUSER_EMAILS) bypass limits (checked inside FeatureGate).
    - In development/local (ENVIRONMENT=development or local), limits are not enforced.
    - If the request has no `q` or empty `q` (e.g. discover/random), the check is
      skipped and usage is not incremented.
    - Otherwise the same tier/usage rules as FeatureGate("ai_search", increment=True) apply.
    """
    if settings.environment in ("development", "local"):
        return True
    q = (request.query_params.get("q") or "").strip()
    if not q:
        return True
    gate = FeatureGate("ai_search", increment=True)
    return await gate(current_user=current_user, db=db)


def require_scene_partner(increment: bool = True) -> Callable:
    """Require ScenePartner access (and optionally increment usage)."""
    return FeatureGate("scene_partner", increment=increment)


def require_craft_coach(increment: bool = True) -> Callable:
    """Require CraftCoach access (and optionally increment usage)."""
    return FeatureGate("craft_coach", increment=increment)


def require_recommendations() -> Callable:
    """Require recommendations feature access."""
    return FeatureGate("recommendations", increment=False)


def require_advanced_analytics() -> Callable:
    """Require advanced analytics access."""
    return FeatureGate("advanced_analytics", increment=False)


def require_script_upload() -> Callable:
    """Require script upload access (checks script count against tier limit)."""
    return FeatureGate("script_upload", increment=False)
