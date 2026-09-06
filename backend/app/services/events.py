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
    }
)

# Emitted by the browser through POST /api/events.
CLIENT_EVENT_NAMES = frozenset(
    {
        "onboarding_step_viewed",  # {step, key}
        "search_box_focused",  # once per /monologues mount
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
