"""
A purchase made as a guest follows the actor into their real account.

The app mints an anonymous Supabase user at launch and RevenueCat's
app_user_id is that user's id, so an App Store purchase made before signing in
lands on the guest. Email sign-up upgrades the guest in place, but Sign in with
Apple, a returning account, or Google without manual linking make a different
Supabase user. The purchase stayed on the guest, the actor used the real
account, and the app asked them to pay again (2026-11-17: a subscriber who paid,
signed in with Apple half an hour later, and wrote that he would cancel).

Two halves:
  - claim_guest(): at sign-in the app proves it held the guest session and the
    guest's live App Store row moves to the account (POST
    /api/subscriptions/claim-guest). A GuestMerge row records the move either
    way, since the purchase webhook can arrive after the sign-in.
  - follow_merge(): the RevenueCat webhook resolves a guest to the account it
    became, so INITIAL_PURCHASE, RENEWAL and EXPIRATION for the guest's
    app_user_id land on the account (RevenueCat keeps sending the guest's id
    until the receipt is transferred).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models.billing import GuestMerge, PricingTier, UserSubscription
from app.models.user import User

logger = logging.getLogger(__name__)

# What the app's own fields are on a subscription row. Copied as one unit so a
# moved row keeps its renewal date, trial marker and cancel state.
_ROW_FIELDS = (
    "tier_id",
    "status",
    "billing_period",
    "current_period_start",
    "current_period_end",
    "cancel_at_period_end",
    "canceled_at",
    "trial_end",
    "source",
)


def is_guest(user: User) -> bool:
    """An anonymous app user: get_current_user mints them a placeholder address."""
    return (user.email or "").endswith("@anon.actorrise.com")


def follow_merge(user: User, db: Session) -> User:
    """The account a guest became, or the user itself. One hop: an account is
    never a guest, so a chain cannot form."""
    merge = db.query(GuestMerge).filter(GuestMerge.guest_user_id == user.id).first()
    if not merge:
        return user
    owner = db.query(User).filter(User.id == merge.owner_user_id).first()
    return owner or user


def _live_app_row(sub: UserSubscription | None, db: Session) -> bool:
    if sub is None or (sub.source or "").lower() != "revenuecat" or not sub.is_active:
        return False
    tier = db.query(PricingTier).get(sub.tier_id) if sub.tier_id else None
    return tier is not None and tier.name != "free"


def _owner_already_paid(sub: UserSubscription | None, db: Session) -> bool:
    """A live paid row of any kind (Stripe, comp, class, app) is not replaced."""
    if sub is None:
        return False
    tier = db.query(PricingTier).get(sub.tier_id) if sub.tier_id else None
    if tier is None or tier.name == "free":
        return False
    if sub.stripe_subscription_id or (sub.source or "").lower() == "stripe":
        return (sub.status or "") in ("active", "trialing", "past_due")
    return sub.is_active


def move_app_subscription(src: User, dst: User, db: Session) -> bool:
    """Move src's live App Store subscription onto dst. True when it moved.

    Left alone when src holds none, or dst already pays some other way (the
    webhook then leaves dst's row alone too, see webhooks._rc_web_row_holds).
    Does not commit."""
    if src.id == dst.id:
        return False
    src_sub = db.query(UserSubscription).filter(UserSubscription.user_id == src.id).first()
    if not _live_app_row(src_sub, db):
        return False
    dst_sub = db.query(UserSubscription).filter(UserSubscription.user_id == dst.id).first()
    if _owner_already_paid(dst_sub, db):
        logger.warning("Guest %s's App Store row not moved: user %s already pays", src.id, dst.id)
        return False
    if dst_sub is None:
        # user_id is unique, so the row itself can simply change hands.
        src_sub.user_id = dst.id
    else:
        for field in _ROW_FIELDS:
            setattr(dst_sub, field, getattr(src_sub, field))
        free = db.query(PricingTier).filter(PricingTier.name == "free").first()
        if free:
            src_sub.tier_id = free.id
        src_sub.status = "expired"
    return True


def claim_guest(guest: User, owner: User, db: Session) -> bool:
    """Record that guest became owner and move the guest's purchase. Commits.
    Returns True when a subscription moved."""
    if guest.id == owner.id or not is_guest(guest) or is_guest(owner):
        return False
    merge = db.query(GuestMerge).filter(GuestMerge.guest_user_id == guest.id).first()
    if merge is None:
        db.add(GuestMerge(guest_user_id=guest.id, owner_user_id=owner.id))
    else:
        merge.owner_user_id = owner.id
    moved = move_app_subscription(guest, owner, db)
    db.commit()
    if moved:
        logger.info("Guest %s's App Store subscription moved to user %s", guest.id, owner.id)
    return moved
