"""Seven days of Plus, no card, for half of new web signups (2026-10-31).

Why: in the 30 days to 2026-10-31, 152 free users saw a wall or an ask, 15
clicked, 9 reached Stripe, 2 finished the card form and none paid; trials that
did start paid about 45% of the time. The card form is the leak, and most free
actors never get deep enough to feel what Plus is. A reverse trial gives a new
actor the whole product for a week, then takes it back; the first wall after
that is an ask about something they already had.

Run as a test against the plain free tier. The arm is the user id's parity,
so it is fixed, even, and checkable by hand: even ids get the week, odd ids
do not. Both arms get a `reverse_trial_arm` event when they finish onboarding,
which is the denominator for comparing trials and payments between them.

The week is a taste (services/taste.py): an ordinary comp row, source
"taste", that ends by itself, once per person. So a reverse-trial actor never
gets the three-day taste at the read wall later, and their checkout carries
no second trial: the next wall asks for the money.

Only accounts created on or after LAUNCH, only real addresses (not Ghost
Light's anonymous accounts), only the web, and never teachers or students,
who already get a month through their class (taste.is_eligible).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.models.user_event import UserEvent
from app.services import taste

logger = logging.getLogger(__name__)

LAUNCH = datetime(2026, 10, 31, tzinfo=timezone.utc)
HOURS = 7 * 24
ARM_EVENT = "reverse_trial_arm"
STARTED_EVENT = "reverse_trial_started"
REVERSE = "reverse"
CONTROL = "control"


def arm(user_id: int) -> str:
    """Even ids get the week."""
    return REVERSE if int(user_id) % 2 == 0 else CONTROL


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def in_test(user) -> bool:
    """Whether this account is part of the test at all."""
    created = _aware(getattr(user, "created_at", None))
    if created is None or created < LAUNCH:
        return False
    email = (getattr(user, "email", None) or "").lower()
    if not email or email.endswith("@anon.actorrise.com"):
        return False
    return True


def on_onboarded(db, user, platform: Optional[str] = None) -> Optional[datetime]:
    """Assign the arm and, on the reverse arm, start the week.

    Called once, when profile onboarding flips to complete. Returns when the
    week ends, or None. Never raises: onboarding must finish regardless.
    """
    try:
        if not in_test(user):
            return None
        uid = int(user.id)
        which = arm(uid)
        eligible = taste.is_eligible(db, user)
        db.add(UserEvent(
            user_id=uid,
            event_name=ARM_EVENT,
            properties={"arm": which, "eligible": eligible},
        ))
        db.commit()
        if which != REVERSE or not eligible:
            return None
        ends = taste.grant(db, user, platform, hours=HOURS, reason=REVERSE)
        if ends is not None:
            db.add(UserEvent(user_id=uid, event_name=STARTED_EVENT, properties={"ends_at": ends.isoformat()}))
            db.commit()
        return ends
    except Exception as exc:  # noqa: BLE001
        logger.warning("reverse_trial: failed for user %s: %s", getattr(user, "id", None), exc)
        try:
            db.rollback()
        except Exception:
            pass
        return None
