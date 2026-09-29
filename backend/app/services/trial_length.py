"""How long a Plus trial runs for this actor: a week, or two if they earned it.

The second week belongs to anyone who has finished a scene. It is the one
behaviour that shows the product working, and until now it won nothing: of the
22 actors who started the guided scene in its first three days, 6 finished.

Decided here and only here. Checkout asks this module, /api/subscriptions/me
reports what it says, and every surface prints that number instead of carrying
its own.
"""

from __future__ import annotations

import logging

from app.models.actor import RehearsalSession
from app.models.user_event import UserEvent

logger = logging.getLogger(__name__)

BASE_TRIAL_DAYS = 7
EARNED_TRIAL_DAYS = 14


def _completed_a_session(db, user_id: int) -> bool:
    return (
        db.query(RehearsalSession.id)
        .filter(RehearsalSession.user_id == user_id, RehearsalSession.status == "completed")
        .first()
        is not None
    )


def _finished_the_guided_scene(db, user_id: int) -> bool:
    # The guided run reports its own finish from the browser, and can get there
    # in tap mode on a phone where the deliver endpoint never closed the
    # session. The actor got to the last line either way.
    return (
        db.query(UserEvent.id)
        .filter(UserEvent.user_id == user_id, UserEvent.event_name == "guided_scene_finished")
        .first()
        is not None
    )


def has_finished_a_scene(db, user_id: int) -> bool:
    try:
        return _completed_a_session(db, user_id) or _finished_the_guided_scene(db, user_id)
    except Exception as exc:  # noqa: BLE001
        # Never let a lookup stand between an actor and the checkout.
        logger.warning("trial_length: lookup failed for user %s: %s", user_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return False


def trial_days_for(db, user_id: int) -> int:
    return EARNED_TRIAL_DAYS if has_finished_a_scene(db, user_id) else BASE_TRIAL_DAYS
