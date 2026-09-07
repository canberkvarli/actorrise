"""Write product events (app/models/user_event.py).

Modelled on services/community.record_event: fire-and-forget, own session,
swallows every error. Instrumentation must never take a request down with it.

The vocabulary is closed on purpose. If a name is not in EVENT_NAMES the call is
a silent no-op, and only CLIENT_EVENT_NAMES may arrive over POST /api/events;
the rest are emitted by the backend at the moment the thing actually happened.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.database import SessionLocal
from app.models.user_event import UserEvent

logger = logging.getLogger(__name__)

# Emitted by the backend where the fact is known for certain.
SERVER_EVENT_NAMES = frozenset(
    {
        "signup_completed",  # users row created with a real email (auth.get_current_user)
        "onboarding_completed",  # has_completed_profile_onboarding flipped false -> true
        "first_search_submitted",  # the user's first search_logs row
        "trial_ended",  # {subscription_id, outcome: converted|cancelled|past_due|...}
        "trial_converted",  # first real charge on a subscription that had a trial
        # What a searcher actually does next. 240 of the 242 people who
        # searched in the last 30 days opened a monologue; 17 rehearsed a
        # scene. Working a monologue wrote nothing at all, so the activation
        # number only ever counted the minority path. Emitted at the metered
        # start, after the gate: a 403 is a paywall, not a rehearsal.
        "monologue_work_started",  # {monologue_id}
    }
)

# Emitted by the browser through POST /api/events.
CLIENT_EVENT_NAMES = frozenset(
    {
        "onboarding_step_viewed",  # {step, key}
        "search_box_focused",  # once per /monologues mount
        # Collection depth: 167 favorites, 2 cuts, 2 notes, 13 memorized. These
        # split "never found the feature" from "found it, didn't want it".
        "cut_editor_opened",  # {monologue_id, surface}
        "notes_field_focused",  # {monologue_id}, once per detail-page mount
        "memorized_toggled",  # {monologue_id, memorized}
        # Margin notes replaced the one box at the foot of the page, on the
        # evidence that the box had been written in twice in the product's
        # life at an average of 30 characters. These are how we find out
        # whether writing on the line itself actually gets used — without
        # them the next read of that number is a guess.
        "beat_saved",  # {monologue_id, segment_index, length, total_beats}
        "beat_cleared",  # same shape; length is 0
        # The other half of monologue_work_started. The run reaching its last
        # line was already known — it fires trackRehearsalCompleted to GA4 —
        # and was thrown away rather than kept where the funnel could join it.
        "monologue_work_finished",  # {monologue_id, lines}
    }
)

EVENT_NAMES = SERVER_EVENT_NAMES | CLIENT_EVENT_NAMES

# Properties are context, not a dumping ground: a handful of short scalars.
MAX_PROPERTY_KEYS = 12
MAX_STRING_LEN = 200
_SCALARS = (str, int, float, bool)


def sanitize_properties(props: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Keep up to MAX_PROPERTY_KEYS scalar values; truncate strings; drop the rest."""
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    for key, value in props.items():
        if len(out) >= MAX_PROPERTY_KEYS:
            break
        if not isinstance(key, str) or not key or len(key) > 48:
            continue
        if value is None:
            continue
        if isinstance(value, bool):
            out[key] = value
        elif isinstance(value, _SCALARS):
            out[key] = value[:MAX_STRING_LEN] if isinstance(value, str) else value
    return out


def trial_outcome(stripe_status: str) -> str:
    """Stripe's post-trial status as an outcome word.

    `active` after `trialing` is a conversion; `canceled` is spelt our way so
    the two webhook paths that can report a cancellation agree on the label.
    Anything else (past_due, unpaid, incomplete_expired) is kept verbatim.
    """
    if stripe_status == "active":
        return "converted"
    if stripe_status == "canceled":
        return "cancelled"
    return stripe_status or "unknown"


def record_trial_ended(
    db,
    user_id: Optional[int],
    subscription_id: Optional[str],
    outcome: str,
    **extra: Any,
) -> bool:
    """One trial_ended per Stripe subscription, whichever webhook says so first.

    A trial's end can reach us three ways (invoice.paid, subscription.updated
    with previous status trialing, subscription.deleted inside the trial
    window) and Stripe does not order them. The subscription id in the
    properties is the dedupe key, so trial-to-paid stays a plain
    count(trial_converted) / count(trial_ended).
    """
    try:
        if subscription_id:
            dup = (
                db.query(UserEvent.id)
                .filter(
                    UserEvent.event_name == "trial_ended",
                    UserEvent.properties["subscription_id"].as_string() == subscription_id,
                )
                .first()
            )
            if dup is not None:
                return False
    except Exception:
        # A failed lookup must not block the write; a rare duplicate is a
        # smaller error than a missing row.
        try:
            db.rollback()
        except Exception:
            pass
    return record_user_event(
        user_id,
        "trial_ended",
        {"subscription_id": subscription_id, "outcome": outcome, **extra},
    )


def record_user_event(
    user_id: Optional[int],
    event_name: str,
    properties: Optional[dict[str, Any]] = None,
) -> bool:
    """Insert one event. Returns True when a row was written. Never raises."""
    try:
        if event_name not in EVENT_NAMES:
            return False
        row = UserEvent(
            user_id=user_id,
            event_name=event_name,
            properties=sanitize_properties(properties),
        )
        db = SessionLocal()
        try:
            db.add(row)
            db.commit()
            return True
        finally:
            db.close()
    except Exception:
        # json.dumps in the message so a bad payload is at least visible in logs.
        logger.debug(
            "user_event dropped: %s %s", event_name, json.dumps(properties, default=str)[:300]
        )
        return False
