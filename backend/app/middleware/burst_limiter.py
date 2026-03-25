"""
Per-user burst rate limiter for expensive AI-powered endpoints.

Prevents abuse (scripted hammering) even on "unlimited" tiers by enforcing
short-window request caps. Normal users will never hit these limits —
they exist purely as a cost/abuse safety net.

Implementation: in-memory sliding-window counters. No Redis needed.
Stale entries are pruned automatically to prevent memory growth.
"""

import time
from collections import defaultdict
from threading import Lock
from typing import Optional

from app.api.auth import get_current_user
from app.core.config import settings
from app.models.user import User
from fastapi import Depends, HTTPException, Request


# ---------------------------------------------------------------------------
# Configuration — requests per window per user
# ---------------------------------------------------------------------------
# Tuned so normal interactive usage never trips these.

BURST_LIMITS: dict[str, dict] = {
    "ai_search": {"max_requests": 15, "window_seconds": 60},
    "film_tv_search": {"max_requests": 15, "window_seconds": 60},
    "scene_partner": {"max_requests": 10, "window_seconds": 60},
    "speech_synthesize": {"max_requests": 20, "window_seconds": 60},
    "speech_transcribe": {"max_requests": 20, "window_seconds": 60},
}

# How often to prune stale entries (seconds)
_PRUNE_INTERVAL = 300

# ---------------------------------------------------------------------------
# Sliding window store
# ---------------------------------------------------------------------------

_lock = Lock()
# _store[feature][user_id] = list of timestamps
_store: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
_last_prune: float = 0.0


def _prune_stale() -> None:
    """Remove entries older than the largest window. Called periodically."""
    global _last_prune
    now = time.monotonic()
    if now - _last_prune < _PRUNE_INTERVAL:
        return
    _last_prune = now
    max_window = max(cfg["window_seconds"] for cfg in BURST_LIMITS.values())
    cutoff = now - max_window
    for feature_store in _store.values():
        dead_keys = []
        for uid, timestamps in feature_store.items():
            timestamps[:] = [t for t in timestamps if t > cutoff]
            if not timestamps:
                dead_keys.append(uid)
        for k in dead_keys:
            del feature_store[k]


def _check_burst(feature: str, user_id: int) -> Optional[str]:
    """
    Record a request and return an error message if the user has exceeded
    the burst limit for this feature, or None if allowed.
    """
    cfg = BURST_LIMITS.get(feature)
    if cfg is None:
        return None

    now = time.monotonic()
    window = cfg["window_seconds"]
    max_req = cfg["max_requests"]

    with _lock:
        _prune_stale()
        timestamps = _store[feature][user_id]
        # Drop timestamps outside the window
        cutoff = now - window
        timestamps[:] = [t for t in timestamps if t > cutoff]

        if len(timestamps) >= max_req:
            return (
                f"Too many requests — limit is {max_req} per {window}s. "
                f"Please slow down and try again shortly."
            )
        timestamps.append(now)
    return None


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

class BurstLimiter:
    """
    FastAPI dependency that enforces per-user burst rate limits.

    Usage:
        @router.post("/search")
        async def search(
            ...,
            _burst: bool = Depends(BurstLimiter("ai_search")),
        ):
            ...
    """

    def __init__(self, feature: str):
        self.feature = feature

    async def __call__(
        self,
        request: Request,
        current_user: User = Depends(get_current_user),
    ) -> bool:
        # Dev/local bypass — consistent with FeatureGate
        if settings.environment in ("development", "local"):
            return True

        # Superuser bypass
        if settings.superuser_emails and current_user.email:
            emails = [
                e.strip().lower()
                for e in settings.superuser_emails.split(",")
                if e.strip()
            ]
            if current_user.email.lower() in emails:
                return True

        error = _check_burst(self.feature, current_user.id)
        if error:
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": error,
                },
            )
        return True
