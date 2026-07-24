"""Community "Green Room" feed API.

GET /api/community/feed is PUBLIC (semi-anonymous by construction) so the
logged-out landing teaser and the in-app feed share one endpoint. The read is a
single created_at DESC scan over the last 48h, enriched with first name / city /
headshot from the actor profile at request time. Opt-out (users.share_activity)
is applied here, so it is retroactive.

PATCH /api/community/settings flips the caller's own opt-out.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorProfile
from app.models.community import CommunityEvent
from app.models.user import User

router = APIRouter(prefix="/api/community", tags=["community"])

# 7 days: at current volume (~4-5 events/day) a 48h window reads as a ghost town.
# A week gives the feed body while newest events still sort to the top.
FEED_WINDOW_HOURS = 24 * 7
# Below this many distinct actors today, the counter widens to "this week" so it
# never reads as a ghost town (~2 concurrent users would look dead).
COUNTER_TODAY_FLOOR = 5


def _first_name(name: Optional[str]) -> str:
    if not name:
        return "Someone"
    return name.strip().split()[0]


def _city(location: Optional[str]) -> Optional[str]:
    if not location:
        return None
    return location.split(",")[0].strip() or None


class FeedEvent(BaseModel):
    id: int
    event_type: str
    name: str
    city: Optional[str] = None
    headshot_url: Optional[str] = None
    payload: Dict[str, Any] = {}
    created_at: datetime


class FeedResponse(BaseModel):
    events: List[FeedEvent]
    actor_count: int  # distinct actors active in the window
    window: str  # "today" | "week"


@router.get("/feed", response_model=FeedResponse)
def get_feed(
    limit: int = Query(60, ge=1, le=100),
    db: Session = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=FEED_WINDOW_HOURS)

    # One indexed created_at DESC scan; left joins pull display identity at read
    # time. Aggregate events (user_id IS NULL, e.g. "trending") always show;
    # user events show only when that user still shares activity.
    rows = (
        db.query(CommunityEvent, User, ActorProfile)
        .outerjoin(User, CommunityEvent.user_id == User.id)
        .outerjoin(ActorProfile, ActorProfile.user_id == User.id)
        .filter(CommunityEvent.created_at >= cutoff)
        .filter(
            or_(
                CommunityEvent.user_id.is_(None),
                User.share_activity.is_(True),
            )
        )
        .order_by(CommunityEvent.created_at.desc())
        .limit(limit)
        .all()
    )

    events: List[FeedEvent] = []
    for event, user, profile in rows:
        display_name = (profile.name if profile else None) or (
            user.name if user else None
        )
        events.append(
            FeedEvent(
                id=event.id,
                event_type=event.event_type,
                name=_first_name(display_name),
                city=_city(profile.location if profile else None),
                headshot_url=profile.headshot_url if profile else None,
                payload=event.payload or {},
                created_at=event.created_at,
            )
        )

    actor_count, window = _actor_count(db)
    return FeedResponse(events=events, actor_count=actor_count, window=window)


def _actor_count(db: Session) -> tuple[int, str]:
    """Distinct sharing actors active today; widens to this week if today is thin."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    def distinct_since(since: datetime) -> int:
        return (
            db.query(func.count(func.distinct(CommunityEvent.user_id)))
            .join(User, CommunityEvent.user_id == User.id)
            .filter(
                CommunityEvent.created_at >= since,
                User.share_activity.is_(True),
            )
            .scalar()
        ) or 0

    today = distinct_since(today_start)
    if today >= COUNTER_TODAY_FLOOR:
        return today, "today"
    week = distinct_since(now - timedelta(days=7))
    return week, "week"


class ShareSettingRequest(BaseModel):
    share_activity: bool


@router.patch("/settings")
def update_settings(
    body: ShareSettingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Flip the caller's own Green Room opt-out. Retroactive (filtered at read)."""
    current_user.share_activity = body.share_activity
    db.commit()
    return {"share_activity": current_user.share_activity}
