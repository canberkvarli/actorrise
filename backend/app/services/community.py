"""Community feed ("Green Room") service.

record_event() is the single write path into community_events. It is built to
be *impossible* to misuse for privacy:

  * Only whitelisted payload keys are stored (ALLOWED_PAYLOAD_KEYS). A raw search
    query passed in as e.g. text="..." is silently dropped — it is not on the list.
  * It opens its own short-lived DB session and swallows every exception, so a feed
    write can never slow down or break the request that triggered it.

Display identity (first name, city, headshot) is NOT stored here — it is joined
from the actor profile at READ time (see app/api/community.py), so a user turning
off users.share_activity hides their whole history retroactively.

See docs/plans/2026-07-24-community-feed-design.md.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.core.database import SessionLocal
from app.models.community import CommunityEvent

logger = logging.getLogger(__name__)

# The only event_type values the feed knows how to render.
VALID_EVENT_TYPES = {
    "joined",
    "searched",
    "viewed",
    "bookmarked",
    "worked",
    "rehearsed",
    "rehearsing",  # live: rehearsing a scene with a partner in the Green Room
    "shared",  # shared a script with the community library
    "milestone",
    "went_plus",
    "trending",
}

# The ONLY keys that may be persisted in payload. Anything else is dropped on
# write — this is the hard wall that keeps raw queries / PII out of the feed.
ALLOWED_PAYLOAD_KEYS = {
    "tone",
    "gender",
    "age_range",
    "author",
    "emotion",
    "themes",
    "monologue_id",
    "title",
    "source_type",
    "line_count",
    "milestone_n",
    "reader_count",
}

# Parsed-search fields that are safe to template into a feed line. A search only
# earns a feed event if it produced at least one of the "intent" fields below —
# a bare, unparseable query is silently skipped (keeps junk out of the feed).
_SEARCH_SAFE_KEYS = ("tone", "gender", "age_range", "author", "emotion", "themes")
_SEARCH_INTENT_KEYS = ("tone", "gender", "age_range")


def build_search_payload(filters: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Extract a safe, feed-worthy payload from query_optimizer filters.

    Returns None when the search has no clean intent to show (so the caller
    skips recording it). Never returns raw query text — only whitelisted keys.
    """
    if not filters:
        return None
    safe = {k: filters.get(k) for k in _SEARCH_SAFE_KEYS if filters.get(k)}
    if not any(k in safe for k in _SEARCH_INTENT_KEYS):
        return None
    return safe


def sanitize_payload(fields: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only whitelisted, non-null keys. This is the hard privacy wall —
    anything not on ALLOWED_PAYLOAD_KEYS (e.g. a raw query passed as text=...)
    is dropped before it can ever reach the database."""
    return {
        k: v
        for k, v in fields.items()
        if k in ALLOWED_PAYLOAD_KEYS and v is not None
    }


def record_event(
    user_id: Optional[int],
    event_type: str,
    **fields: Any,
) -> None:
    """Fire-and-forget write of one community event.

    Safe to call inline from any endpoint: opens its own session, validates,
    inserts, commits, and swallows ALL errors. Never raises, never blocks the
    caller beyond a single tiny indexed insert.
    """
    try:
        if event_type not in VALID_EVENT_TYPES:
            return
        payload = sanitize_payload(fields)
        db = SessionLocal()
        try:
            db.add(
                CommunityEvent(
                    user_id=user_id,
                    event_type=event_type,
                    payload=payload,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — feed writes must never surface to the caller
        logger.debug("record_event failed (%s) — swallowed", event_type, exc_info=True)
