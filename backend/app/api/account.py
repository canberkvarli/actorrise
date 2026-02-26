"""
Account management API endpoints.

Endpoints for user account operations including account deletion.
"""

import logging
import os

import stripe
from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.billing import BillingHistory, UsageMetrics, UserSubscription
from app.models.favorites import MonologueFavorite, SceneFavorite
from app.models.rehearsal import LineDelivery, RehearsalSession
from app.models.scripts import Scene, UserScript
from app.models.search import SearchHistory
from app.models.user import ActorProfile, User
from app.services.storage import delete_headshot
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/account", tags=["account"])
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

logger = logging.getLogger(__name__)


@router.post("/delete", status_code=status.HTTP_200_OK)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently delete the current user's account and all associated data.

    This will:
    - Cancel any active Stripe subscription immediately
    - Delete all user data (scripts, favorites, search history, etc.)
    - Remove the user record

    Returns 200 on success. User should be signed out client-side after this.
    """
    user_id = current_user.id

    try:
        # Step 1: Cancel Stripe subscription if active
        subscription = (
            db.query(UserSubscription)
            .filter(UserSubscription.user_id == user_id)
            .first()
        )

        if subscription and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.delete(subscription.stripe_subscription_id)
                logger.info(f"Canceled Stripe subscription for user {user_id}")
            except stripe.error.StripeError as e:
                # Log but continue - we'll still delete the data
                logger.warning(f"Failed to cancel Stripe subscription for user {user_id}: {e}")

        # Step 2: Delete headshot from storage
        try:
            delete_headshot(user_id)
        except Exception as e:
            logger.warning(f"Failed to delete headshot for user {user_id}: {e}")

        # Step 3: Delete rehearsal data (line deliveries first, then sessions)
        db.query(LineDelivery).filter(
            LineDelivery.session_id.in_(
                db.query(RehearsalSession.id).filter(RehearsalSession.user_id == user_id)
            )
        ).delete(synchronize_session=False)
        db.query(RehearsalSession).filter(RehearsalSession.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 4: Delete favorites
        db.query(SceneFavorite).filter(SceneFavorite.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(MonologueFavorite).filter(MonologueFavorite.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 5: Delete user scripts (unlink scenes first)
        user_script_ids = [
            row[0]
            for row in db.query(UserScript.id).filter(UserScript.user_id == user_id).all()
        ]
        if user_script_ids:
            db.query(Scene).filter(Scene.user_script_id.in_(user_script_ids)).update(
                {"user_script_id": None}, synchronize_session=False
            )
            db.query(UserScript).filter(UserScript.user_id == user_id).delete(
                synchronize_session=False
            )

        # Step 6: Delete search history
        db.query(SearchHistory).filter(SearchHistory.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 7: Delete actor profile
        db.query(ActorProfile).filter(ActorProfile.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 8: Delete usage metrics and billing history
        db.query(UsageMetrics).filter(UsageMetrics.user_id == user_id).delete(
            synchronize_session=False
        )
        db.query(BillingHistory).filter(BillingHistory.user_id == user_id).delete(
            synchronize_session=False
        )

        # Step 9: Delete subscription record
        if subscription:
            db.delete(subscription)

        # Step 10: Delete user
        db.query(User).filter(User.id == user_id).delete(synchronize_session=False)

        db.commit()
        logger.info(f"Successfully deleted account for user {user_id}")

        return {"message": "Account deleted successfully"}

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete account for user {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again or contact support.",
        )
