"""
Public API for landing page and marketing (no auth).

Returns aggregate stats suitable for public display (e.g. total searches, library size).
Cached to limit DB load.
"""

import time
from typing import Any

from app.core.database import get_db
from app.models.actor import FilmTvReference, Monologue, Play
from app.models.billing import UsageMetrics
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/public", tags=["public"])

# In-memory cache: (value, expiry_ts). TTL 30s for full payload so landing "live count" updates soon.
# Library counts are stable; first request can be slow on large DBs so cache reduces repeated work.
_CACHE: dict[str, tuple[Any, float]] = {}
_CACHE_TTL_SEC = 30

# Demo searches (landing page) increment this so the public count ticks up when anyone tries the demo.
# Resets on process restart; added to DB total for display.
_demo_searches_count = 0


def record_demo_search() -> None:
    """Call when a landing-page demo search is performed. Adds to public total_searches."""
    global _demo_searches_count
    _demo_searches_count += 1
    # Invalidate cache so the next GET /api/public/stats returns the new count (live update).
    _CACHE.pop("public_stats", None)


@router.get("/stats")
def get_public_stats(db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Return public stats for the landing page (no auth).
    total_searches: DB sum of all searches (with results) + demo count.
    total_monologues, total_plays, total_film_tv_references: library size. Cached 30s.
    """
    now = time.time()
    cached = _CACHE.get("public_stats")
    if cached is not None and cached[1] > now:
        return cached[0]

    # All search types (monologue + film/TV + etc.) for the big "live" number.
    # Fall back to ai_searches_count if total_searches_count not yet migrated.
    try:
        db_total = db.query(
            func.coalesce(func.sum(UsageMetrics.total_searches_count), 0)
        ).scalar() or 0
    except Exception:
        db_total = db.query(
            func.coalesce(func.sum(UsageMetrics.ai_searches_count), 0)
        ).scalar() or 0
    total = int(db_total) + _demo_searches_count

    # Content record counts (for "8,600+ monologues", "14,000+ film & TV", etc.)
    monologue_count = db.query(func.count(Monologue.id)).scalar() or 0
    play_count = db.query(func.count(Play.id)).scalar() or 0
    film_tv_count = db.query(func.count(FilmTvReference.id)).scalar() or 0

    payload = {
        "total_searches": total,
        "total_monologues": int(monologue_count),
        "total_plays": int(play_count),
        "total_film_tv_references": int(film_tv_count),
    }
    _CACHE["public_stats"] = (payload, now + _CACHE_TTL_SEC)
    return payload
