from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Date, cast, desc, func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorProfile
from app.models.billing import (
    AdminAuditLog,
    PricingTier,
    UsageMetrics,
    UserBenefitOverride,
    UserSubscription,
)
from app.models.user import User
from app.services.benefits import get_effective_benefits

router = APIRouter(prefix="/api/admin/users", tags=["admin", "users"])


SUBSCRIPTION_STATUSES = {"active", "trialing", "canceled", "past_due", "unpaid", "incomplete"}
SUBSCRIPTION_PERIODS = {"monthly", "annual"}


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if current_user.is_moderator is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


def require_sensitive_admin(current_user: User = Depends(require_moderator)) -> User:
    if current_user.can_approve_submissions is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission for sensitive admin actions",
        )
    return current_user


class AdminUserListItem(BaseModel):
    id: int
    email: str
    name: str | None
    profile_name: str | None
    created_at: datetime | None
    is_moderator: bool
    can_approve_submissions: bool
    email_verified: bool
    tier_name: str
    tier_display_name: str
    subscription_status: str
    billing_period: str
    profile_exists: bool


class AdminUsersListResponse(BaseModel):
    items: list[AdminUserListItem]
    total: int
    limit: int
    offset: int


class BenefitOverrideResponse(BaseModel):
    id: int
    feature_key: str
    override_type: str
    value: Any = None
    expires_at: datetime | None
    note: str | None
    created_by_admin_id: int | None
    created_at: datetime | None


class AdminAuditLogResponse(BaseModel):
    id: int
    actor_admin_id: int
    actor_admin_email: str | None = None
    target_user_id: int
    action_type: str
    before_json: dict[str, Any] | None = None
    after_json: dict[str, Any] | None = None
    note: str | None = None
    created_at: datetime | None = None


class AdminUserDetailResponse(BaseModel):
    user: dict[str, Any]
    profile: dict[str, Any] | None
    subscription: dict[str, Any] | None
    usage: dict[str, Any]
    effective_benefits: dict[str, Any]
    benefit_overrides: list[BenefitOverrideResponse]
    audit_logs: list[AdminAuditLogResponse]


class AdminProfilePatchRequest(BaseModel):
    name: str | None = None
    marketing_opt_in: bool | None = None
    has_seen_welcome: bool | None = None
    has_seen_search_tour: bool | None = None
    has_seen_profile_tour: bool | None = None
    email_verified: bool | None = None
    profile: dict[str, Any] | None = None
    note: str = Field(min_length=3)


class AdminSubscriptionPatchRequest(BaseModel):
    tier_id: int | None = None
    status: str | None = None
    billing_period: str | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool | None = None
    canceled_at: datetime | None = None
    trial_end: datetime | None = None
    note: str = Field(min_length=3)


class AdminBenefitPatchRequest(BaseModel):
    feature_key: str = Field(min_length=1)
    override_type: Literal["set", "revoke"]
    value: Any = None
    expires_at: datetime | None = None
    clear_existing: bool = True
    note: str = Field(min_length=3)


class AdminRolesPatchRequest(BaseModel):
    is_moderator: bool | None = None
    can_approve_submissions: bool | None = None
    email_verified: bool | None = None
    note: str = Field(min_length=3)


def _serialize_subscription(subscription: UserSubscription | None, tier: PricingTier | None) -> dict[str, Any] | None:
    if not subscription:
        return None
    return {
        "id": subscription.id,
        "tier_id": subscription.tier_id,
        "tier_name": tier.name if tier else "free",
        "tier_display_name": tier.display_name if tier else "Free",
        "status": subscription.status,
        "billing_period": subscription.billing_period,
        "current_period_start": subscription.current_period_start,
        "current_period_end": subscription.current_period_end,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "canceled_at": subscription.canceled_at,
        "trial_end": subscription.trial_end,
    }


def _serialize_profile(profile: ActorProfile | None) -> dict[str, Any] | None:
    if not profile:
        return None
    return {
        "id": profile.id,
        "name": profile.name,
        "age_range": profile.age_range,
        "gender": profile.gender,
        "ethnicity": profile.ethnicity,
        "height": profile.height,
        "build": profile.build,
        "location": profile.location,
        "experience_level": profile.experience_level,
        "type": profile.type,
        "training_background": profile.training_background,
        "union_status": profile.union_status,
        "preferred_genres": profile.preferred_genres,
        "overdone_alert_sensitivity": profile.overdone_alert_sensitivity,
        "profile_bias_enabled": profile.profile_bias_enabled,
        "headshot_url": profile.headshot_url,
    }


def _serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_moderator": user.is_moderator,
        "can_approve_submissions": user.can_approve_submissions,
        "email_verified": user.email_verified,
        "marketing_opt_in": user.marketing_opt_in,
        "has_seen_welcome": user.has_seen_welcome,
        "has_seen_search_tour": user.has_seen_search_tour,
        "has_seen_profile_tour": user.has_seen_profile_tour,
        "created_at": user.created_at,
    }


def _create_audit_log(
    db: Session,
    *,
    actor_admin_id: int,
    target_user_id: int,
    action_type: str,
    before_json: dict[str, Any] | None,
    after_json: dict[str, Any] | None,
    note: str | None,
) -> None:
    log = AdminAuditLog(
        actor_admin_id=actor_admin_id,
        target_user_id=target_user_id,
        action_type=action_type,
        before_json=before_json,
        after_json=after_json,
        note=note,
    )
    db.add(log)


@router.get("", response_model=AdminUsersListResponse)
def list_admin_users(
    q: str | None = Query(None, description="Search by email or name"),
    is_moderator: bool | None = Query(None),
    subscription_status: str | None = Query(None),
    tier_name: str | None = Query(None),
    created_from: date | None = Query(None),
    created_to: date | None = Query(None),
    sort_by: str = Query("created_at", pattern="^(created_at|email|name|tier_name|subscription_status)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    query = (
        db.query(User, ActorProfile, UserSubscription, PricingTier)
        .outerjoin(ActorProfile, ActorProfile.user_id == User.id)
        .outerjoin(UserSubscription, UserSubscription.user_id == User.id)
        .outerjoin(PricingTier, PricingTier.id == UserSubscription.tier_id)
    )

    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.email.ilike(like), User.name.ilike(like)))
    if is_moderator is not None:
        query = query.filter(User.is_moderator == is_moderator)
    if subscription_status:
        query = query.filter(UserSubscription.status == subscription_status)
    if tier_name:
        query = query.filter(PricingTier.name == tier_name.lower())
    if created_from:
        query = query.filter(cast(User.created_at, Date) >= created_from)
    if created_to:
        query = query.filter(cast(User.created_at, Date) <= created_to)

    sort_columns = {
        "created_at": User.created_at,
        "email": User.email,
        "name": User.name,
        "tier_name": PricingTier.name,
        "subscription_status": UserSubscription.status,
    }
    order_col = sort_columns.get(sort_by, User.created_at)
    if sort_order == "asc":
        query = query.order_by(order_col.asc().nullslast(), User.id.asc())
    else:
        query = query.order_by(desc(order_col).nullslast(), User.id.desc())

    total = query.count()
    rows = query.limit(limit).offset(offset).all()

    items: list[AdminUserListItem] = []
    for user, profile, subscription, tier in rows:
        items.append(
            AdminUserListItem(
                id=user.id,
                email=user.email,
                name=user.name,
                profile_name=profile.name if profile else None,
                created_at=user.created_at,
                is_moderator=bool(user.is_moderator),
                can_approve_submissions=bool(user.can_approve_submissions),
                email_verified=bool(user.email_verified),
                tier_name=tier.name if tier else "free",
                tier_display_name=tier.display_name if tier else "Free",
                subscription_status=subscription.status if subscription else "active",
                billing_period=subscription.billing_period if subscription else "monthly",
                profile_exists=profile is not None,
            )
        )

    return AdminUsersListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{user_id}", response_model=AdminUserDetailResponse)
def get_admin_user_detail(
    user_id: int,
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.query(ActorProfile).filter(ActorProfile.user_id == user.id).first()
    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == user.id).first()
    tier = db.query(PricingTier).get(subscription.tier_id) if subscription else None

    today = date.today()
    first_day = today.replace(day=1)
    month_usage = db.query(
        func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0).label("ai_searches"),
        func.coalesce(func.sum(UsageMetrics.total_searches_count), 0).label("total_searches"),
        func.coalesce(func.sum(UsageMetrics.scene_partner_sessions), 0).label("scene_partner"),
        func.coalesce(func.sum(UsageMetrics.craft_coach_sessions), 0).label("craft_coach"),
    ).filter(UsageMetrics.user_id == user.id, UsageMetrics.date >= first_day).first()

    alltime_usage = db.query(
        func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0).label("ai_searches"),
        func.coalesce(func.sum(UsageMetrics.total_searches_count), 0).label("total_searches"),
        func.coalesce(func.sum(UsageMetrics.scene_partner_sessions), 0).label("scene_partner"),
        func.coalesce(func.sum(UsageMetrics.craft_coach_sessions), 0).label("craft_coach"),
    ).filter(UsageMetrics.user_id == user.id).first()

    active_overrides = (
        db.query(UserBenefitOverride)
        .filter(
            UserBenefitOverride.user_id == user.id,
            (UserBenefitOverride.expires_at.is_(None))
            | (UserBenefitOverride.expires_at >= datetime.now(timezone.utc)),
        )
        .order_by(UserBenefitOverride.created_at.desc())
        .all()
    )

    effective = get_effective_benefits(db, user.id, subscription)

    actor_ids = (
        db.query(User.id, User.email)
        .filter(
            User.id.in_(
                db.query(AdminAuditLog.actor_admin_id).filter(AdminAuditLog.target_user_id == user.id)
            )
        )
        .all()
    )
    actor_email_map = {actor_id: email for actor_id, email in actor_ids}
    audit_logs = (
        db.query(AdminAuditLog)
        .filter(AdminAuditLog.target_user_id == user.id)
        .order_by(AdminAuditLog.created_at.desc())
        .limit(100)
        .all()
    )

    return AdminUserDetailResponse(
        user=_serialize_user(user),
        profile=_serialize_profile(profile),
        subscription=_serialize_subscription(subscription, tier),
        usage={
            "monthly": {
                "ai_searches": int(month_usage.ai_searches or 0),
                "total_searches": int(month_usage.total_searches or 0),
                "scene_partner_sessions": int(month_usage.scene_partner or 0),
                "craft_coach_sessions": int(month_usage.craft_coach or 0),
            },
            "all_time": {
                "ai_searches": int(alltime_usage.ai_searches or 0),
                "total_searches": int(alltime_usage.total_searches or 0),
                "scene_partner_sessions": int(alltime_usage.scene_partner or 0),
                "craft_coach_sessions": int(alltime_usage.craft_coach or 0),
            },
        },
        effective_benefits=effective,
        benefit_overrides=[
            BenefitOverrideResponse(
                id=o.id,
                feature_key=o.feature_key,
                override_type=o.override_type,
                value=o.value,
                expires_at=o.expires_at,
                note=o.note,
                created_by_admin_id=o.created_by_admin_id,
                created_at=o.created_at,
            )
            for o in active_overrides
        ],
        audit_logs=[
            AdminAuditLogResponse(
                id=log.id,
                actor_admin_id=log.actor_admin_id,
                actor_admin_email=actor_email_map.get(log.actor_admin_id),
                target_user_id=log.target_user_id,
                action_type=log.action_type,
                before_json=log.before_json,
                after_json=log.after_json,
                note=log.note,
                created_at=log.created_at,
            )
            for log in audit_logs
        ],
    )


@router.patch("/{user_id}/profile")
def patch_admin_user_profile(
    user_id: int,
    body: AdminProfilePatchRequest,
    admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.query(ActorProfile).filter(ActorProfile.user_id == target.id).first()
    before = {"user": _serialize_user(target), "profile": _serialize_profile(profile)}

    if body.name is not None:
        target.name = body.name
    if body.marketing_opt_in is not None:
        target.marketing_opt_in = body.marketing_opt_in
    if body.has_seen_welcome is not None:
        target.has_seen_welcome = body.has_seen_welcome
    if body.has_seen_search_tour is not None:
        target.has_seen_search_tour = body.has_seen_search_tour
    if body.has_seen_profile_tour is not None:
        target.has_seen_profile_tour = body.has_seen_profile_tour
    if body.email_verified is not None:
        target.email_verified = body.email_verified

    if body.profile:
        allowed_profile_fields = {
            "name",
            "age_range",
            "gender",
            "ethnicity",
            "height",
            "build",
            "location",
            "experience_level",
            "type",
            "training_background",
            "union_status",
            "preferred_genres",
            "overdone_alert_sensitivity",
            "profile_bias_enabled",
            "headshot_url",
        }
        invalid = [k for k in body.profile.keys() if k not in allowed_profile_fields]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid profile fields: {', '.join(invalid)}")
        if profile is None:
            profile = ActorProfile(user_id=target.id)
            db.add(profile)
        for key, value in body.profile.items():
            setattr(profile, key, value)

    db.flush()
    after = {"user": _serialize_user(target), "profile": _serialize_profile(profile)}
    _create_audit_log(
        db,
        actor_admin_id=admin.id,
        target_user_id=target.id,
        action_type="admin.user.profile_update",
        before_json=before,
        after_json=after,
        note=body.note,
    )
    db.commit()
    return after


@router.patch("/{user_id}/subscription")
def patch_admin_user_subscription(
    user_id: int,
    body: AdminSubscriptionPatchRequest,
    admin: User = Depends(require_sensitive_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    if body.status and body.status not in SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid subscription status")
    if body.billing_period and body.billing_period not in SUBSCRIPTION_PERIODS:
        raise HTTPException(status_code=400, detail="Invalid billing period")

    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == target.id).first()
    if subscription is None:
        tier_id = body.tier_id
        if tier_id is None:
            free_tier = db.query(PricingTier).filter(PricingTier.name == "free").first()
            if free_tier is None:
                raise HTTPException(status_code=500, detail="Free tier not found")
            tier_id = free_tier.id
        subscription = UserSubscription(user_id=target.id, tier_id=tier_id)
        db.add(subscription)
        db.flush()

    previous_tier = db.query(PricingTier).get(subscription.tier_id) if subscription.tier_id else None
    before = _serialize_subscription(subscription, previous_tier)

    if body.tier_id is not None:
        tier = db.query(PricingTier).get(body.tier_id)
        if tier is None:
            raise HTTPException(status_code=404, detail="Pricing tier not found")
        subscription.tier_id = body.tier_id
    if body.status is not None:
        subscription.status = body.status
    if body.billing_period is not None:
        subscription.billing_period = body.billing_period
    if body.current_period_start is not None:
        subscription.current_period_start = body.current_period_start
    if body.current_period_end is not None:
        subscription.current_period_end = body.current_period_end
    if body.cancel_at_period_end is not None:
        subscription.cancel_at_period_end = body.cancel_at_period_end
    if body.canceled_at is not None:
        subscription.canceled_at = body.canceled_at
    if body.trial_end is not None:
        subscription.trial_end = body.trial_end

    db.flush()
    next_tier = db.query(PricingTier).get(subscription.tier_id) if subscription.tier_id else None
    after = _serialize_subscription(subscription, next_tier)
    _create_audit_log(
        db,
        actor_admin_id=admin.id,
        target_user_id=target.id,
        action_type="admin.user.subscription_update",
        before_json=before,
        after_json=after,
        note=body.note,
    )
    db.commit()
    return after


@router.patch("/{user_id}/benefits")
def patch_admin_user_benefits(
    user_id: int,
    body: AdminBenefitPatchRequest,
    admin: User = Depends(require_sensitive_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if body.override_type == "set" and body.value is None:
        raise HTTPException(status_code=400, detail="value is required when override_type='set'")

    subscription = db.query(UserSubscription).filter(UserSubscription.user_id == target.id).first()
    before_effective = get_effective_benefits(db, target.id, subscription)
    before_overrides = (
        db.query(UserBenefitOverride)
        .filter(UserBenefitOverride.user_id == target.id, UserBenefitOverride.feature_key == body.feature_key)
        .all()
    )

    if body.clear_existing:
        (
            db.query(UserBenefitOverride)
            .filter(UserBenefitOverride.user_id == target.id, UserBenefitOverride.feature_key == body.feature_key)
            .delete(synchronize_session=False)
        )

    override = UserBenefitOverride(
        user_id=target.id,
        feature_key=body.feature_key,
        override_type=body.override_type,
        value=body.value if body.override_type == "set" else None,
        expires_at=body.expires_at,
        note=body.note,
        created_by_admin_id=admin.id,
    )
    db.add(override)
    db.flush()

    after_effective = get_effective_benefits(db, target.id, subscription)
    _create_audit_log(
        db,
        actor_admin_id=admin.id,
        target_user_id=target.id,
        action_type="admin.user.benefit_override_update",
        before_json={
            "effective_benefits": before_effective,
            "override_count": len(before_overrides),
            "feature_key": body.feature_key,
        },
        after_json={
            "effective_benefits": after_effective,
            "new_override_id": override.id,
            "feature_key": body.feature_key,
            "override_type": body.override_type,
        },
        note=body.note,
    )
    db.commit()
    return {"effective_benefits": after_effective}


@router.patch("/{user_id}/roles")
def patch_admin_user_roles(
    user_id: int,
    body: AdminRolesPatchRequest,
    admin: User = Depends(require_sensitive_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    before = _serialize_user(target)
    if body.is_moderator is not None:
        target.is_moderator = body.is_moderator
    if body.can_approve_submissions is not None:
        target.can_approve_submissions = body.can_approve_submissions
        if body.can_approve_submissions:
            target.is_moderator = True
    if body.email_verified is not None:
        target.email_verified = body.email_verified

    if target.is_moderator is not True and target.can_approve_submissions is True:
        raise HTTPException(
            status_code=400,
            detail="can_approve_submissions requires is_moderator=true",
        )

    db.flush()
    after = _serialize_user(target)
    _create_audit_log(
        db,
        actor_admin_id=admin.id,
        target_user_id=target.id,
        action_type="admin.user.roles_update",
        before_json=before,
        after_json=after,
        note=body.note,
    )
    db.commit()
    return after
