"""
Shared user deletion logic for the user self-delete and admin delete endpoints.

Having both endpoints call a single helper prevents them from drifting and
missing newly-added tables that reference users.id. Every FK on users.id
should be handled here.
"""

import logging
import os

import stripe
from app.models.actor import (
    ActorProfile,
    FilmTvFavorite,
    MonologueFavorite,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneFavorite,
    SearchHistory,
    UserScript,
)
from app.models.billing import (
    AdminAuditLog,
    BillingHistory,
    UsageMetrics,
    UserBenefitOverride,
    UserSubscription,
)
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.email_tracking import EmailBatch, EmailSend
from app.models.feedback import FeedbackImpression, ResultFeedback
from app.models.founding_actor import FoundingActor
from app.models.moderation import ModerationLog, MonologueSubmission
from app.models.search_log import SearchLog
from app.models.user import User
from app.services.storage import delete_headshot
from sqlalchemy.orm import Session

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
logger = logging.getLogger(__name__)


def _delete_supabase_auth_user(supabase_id: str) -> None:
    """Delete the Supabase auth.users identity for this account.

    Without this, wiping the app's `users` row leaves the LOGIN alive: the person
    (and an App Store reviewer testing Guideline 5.1.1(v)) can still sign in, so
    the account was never really deleted. Raises on failure so the caller rolls
    the whole deletion back and the client can retry — we must never report a
    successful deletion while the auth row survives.

    Idempotent: an already-absent auth user counts as success, so a retry after a
    partial delete still completes.
    """
    from app.core.security import get_supabase_client

    client = get_supabase_client()
    if client is None:
        raise RuntimeError(
            "Supabase admin client unavailable (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY not set); cannot delete the auth identity"
        )
    try:
        client.auth.admin.delete_user(supabase_id)
        logger.info("Deleted Supabase auth user %s", supabase_id)
    except Exception as e:  # noqa: BLE001
        msg = str(e).lower()
        if "not found" in msg or "404" in msg or "user_not_found" in msg:
            logger.info("Supabase auth user %s already absent", supabase_id)
            return
        raise


def delete_user_completely(db: Session, user_id: int) -> None:
    """Delete a user and every record that references their users.id.

    The caller owns transaction control: this function does NOT commit or
    rollback. On success the caller should db.commit(); on exception the
    caller should db.rollback().

    Order matters: child rows first, then parent. Tables whose FK is nullable
    are unlinked (SET NULL) rather than deleted, so we preserve audit data
    (search logs, public founding roster, feedback, etc.) without losing
    the link to a now-deleted user.
    """
    # Capture the Supabase auth id before its `users` row is gone — it is what
    # we need to delete the login identity at the very end.
    user_row = db.query(User).filter(User.id == user_id).first()
    supabase_id = getattr(user_row, "supabase_id", None) if user_row else None

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
            logger.warning(
                f"Failed to cancel Stripe subscription for user {user_id}: {e}"
            )

    try:
        delete_headshot(user_id)
    except Exception as e:
        logger.warning(f"Failed to delete headshot for user {user_id}: {e}")

    db.query(RehearsalLineDelivery).filter(
        RehearsalLineDelivery.session_id.in_(
            db.query(RehearsalSession.id).filter(RehearsalSession.user_id == user_id)
        )
    ).delete(synchronize_session=False)
    db.query(RehearsalSession).filter(RehearsalSession.user_id == user_id).delete(
        synchronize_session=False
    )

    db.query(SceneFavorite).filter(SceneFavorite.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(MonologueFavorite).filter(MonologueFavorite.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(FilmTvFavorite).filter(FilmTvFavorite.user_id == user_id).delete(
        synchronize_session=False
    )

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

    db.query(SearchHistory).filter(SearchHistory.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(SearchLog).filter(SearchLog.user_id == user_id).update(
        {"user_id": None}, synchronize_session=False
    )

    db.query(ActorProfile).filter(ActorProfile.user_id == user_id).delete(
        synchronize_session=False
    )

    # Unlink (not delete) so the public roster entry survives if it was published.
    db.query(FoundingActor).filter(FoundingActor.user_id == user_id).update(
        {"user_id": None}, synchronize_session=False
    )

    db.query(UsageMetrics).filter(UsageMetrics.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(BillingHistory).filter(BillingHistory.user_id == user_id).delete(
        synchronize_session=False
    )

    db.query(UserBenefitOverride).filter(
        UserBenefitOverride.user_id == user_id
    ).delete(synchronize_session=False)
    db.query(UserBenefitOverride).filter(
        UserBenefitOverride.created_by_admin_id == user_id
    ).update({"created_by_admin_id": None}, synchronize_session=False)

    submission_ids = [
        row[0]
        for row in db.query(MonologueSubmission.id)
        .filter(MonologueSubmission.user_id == user_id)
        .all()
    ]
    if submission_ids:
        db.query(ModerationLog).filter(
            ModerationLog.submission_id.in_(submission_ids)
        ).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.user_id == user_id
        ).delete(synchronize_session=False)
    db.query(MonologueSubmission).filter(
        MonologueSubmission.reviewer_id == user_id
    ).update({"reviewer_id": None}, synchronize_session=False)
    db.query(ModerationLog).filter(ModerationLog.actor_id == user_id).update(
        {"actor_id": None}, synchronize_session=False
    )

    db.query(AdminAuditLog).filter(
        AdminAuditLog.target_user_id == user_id
    ).delete(synchronize_session=False)
    db.query(AdminAuditLog).filter(
        AdminAuditLog.actor_admin_id == user_id
    ).delete(synchronize_session=False)

    # EmailBatch.created_by is NOT NULL, so we delete the batches (and their sends first).
    batch_ids = [
        row[0]
        for row in db.query(EmailBatch.id)
        .filter(EmailBatch.created_by == user_id)
        .all()
    ]
    if batch_ids:
        db.query(EmailSend).filter(EmailSend.batch_id.in_(batch_ids)).delete(
            synchronize_session=False
        )
        db.query(EmailBatch).filter(EmailBatch.id.in_(batch_ids)).delete(
            synchronize_session=False
        )
    db.query(EmailDoNotContact).filter(
        EmailDoNotContact.added_by == user_id
    ).update({"added_by": None}, synchronize_session=False)

    db.query(ResultFeedback).filter(ResultFeedback.user_id == user_id).update(
        {"user_id": None}, synchronize_session=False
    )
    # Impressions are anonymous telemetry; unlink rather than delete so the
    # aggregate response-rate series stays intact after an account goes away.
    db.query(FeedbackImpression).filter(
        FeedbackImpression.user_id == user_id
    ).update({"user_id": None}, synchronize_session=False)

    if subscription:
        db.delete(subscription)

    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)

    # Delete the login identity itself, last. Done before the caller commits: if
    # this fails the whole deletion rolls back rather than leaving a working
    # login behind a wiped profile — the exact bug App Store review flags under
    # Guideline 5.1.1(v). Idempotent, raises on real failure (see helper).
    if supabase_id:
        _delete_supabase_auth_user(str(supabase_id))
    else:
        logger.warning(
            "User %s had no supabase_id; no Supabase auth identity to delete", user_id
        )
