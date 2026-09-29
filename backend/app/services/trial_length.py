"""How long a Plus trial runs for this actor: a week, or two if they earned it.

The second week belongs to anyone who has finished a scene. It is the one
behaviour that shows the product working, and until now it won nothing: of the
22 actors who started the guided scene in its first three days, 6 finished.

"Finished" is the server's word, never the browser's. It means a
rehearsal_sessions row the deliver endpoint closed as `completed`, which
happens when the actor's last line arrives (api/scenes.py). The browser also
reports guided_scene_finished through POST /api/events, and that event is
deliberately NOT read here: any signed-in client can post it, and a name a
client can send must not be able to grant something. Checked 2026-09-29: all 6
actors with that event, tap mode included, also hold a completed session, so
nothing is lost by ignoring it.

Decided here and only here. Checkout asks this module, /api/subscriptions/me
reports what it says, and every surface prints that number instead of carrying
its own.
"""

from __future__ import annotations

import logging

from app.models.actor import RehearsalSession

logger = logging.getLogger(__name__)

BASE_TRIAL_DAYS = 7
EARNED_TRIAL_DAYS = 14


def has_finished_a_scene(db, user_id: int) -> bool:
    try:
        return (
            db.query(RehearsalSession.id)
            .filter(
                RehearsalSession.user_id == user_id,
                RehearsalSession.status == "completed",
            )
            .first()
            is not None
        )
    except Exception as exc:  # noqa: BLE001
        # Never let a lookup stand between an actor and the checkout. Failing
        # gives the shorter trial, never the longer one.
        logger.warning("trial_length: lookup failed for user %s: %s", user_id, exc)
        try:
            db.rollback()
        except Exception:
            pass
        return False


def trial_days_for(db, user_id: int) -> int:
    return EARNED_TRIAL_DAYS if has_finished_a_scene(db, user_id) else BASE_TRIAL_DAYS
