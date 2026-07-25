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

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import ActorProfile, UserScript
from app.models.community import CommunityEvent
from app.models.user import User

# Community library needs at least this many shared scripts before it stops
# showing the "still gathering" cold-start state.
COMMUNITY_LIBRARY_MIN = 3

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


def _mask_name(name: str) -> str:
    """First initial only, for the logged-out landing teaser — real names are
    never shipped to unauthenticated visitors (the blur is a real tease)."""
    first = (name or "?").strip()[:1] or "?"
    return f"{first}•••"


@router.get("/feed", response_model=FeedResponse)
def get_feed(
    limit: int = Query(60, ge=1, le=100),
    anonymize: bool = Query(False, description="Mask names to a first initial (logged-out teaser)"),
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
        first = _first_name(display_name)
        events.append(
            FeedEvent(
                id=event.id,
                event_type=event.event_type,
                name=_mask_name(first) if anonymize else first,
                city=_city(profile.location if profile else None),
                # Never ship real faces to the logged-out teaser.
                headshot_url=None if anonymize else (profile.headshot_url if profile else None),
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


class CommunityScript(BaseModel):
    id: int
    title: str
    author: str
    genre: Optional[str] = None
    owner_name: str
    scene_count: int
    character_count: int
    scene_titles: List[str] = []
    shared_at: datetime
    is_demo: bool = False


class CommunityLibraryResponse(BaseModel):
    scripts: List[CommunityScript]
    total: int
    ready: bool  # False → show the "still gathering scripts" cold-start state


@router.get("/scripts", response_model=CommunityLibraryResponse)
def get_community_scripts(
    limit: int = Query(60, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Scripts in the Green Room community library — actor-shared plus the system
    demo scripts (labeled), so the shelf is never empty. Public, semi-anon owner."""
    rows = (
        db.query(UserScript, User, ActorProfile)
        .outerjoin(User, UserScript.user_id == User.id)
        .outerjoin(ActorProfile, ActorProfile.user_id == User.id)
        .filter(
            or_(
                UserScript.shared_with_community.is_(True),
                UserScript.is_sample.is_(True),
            )
        )
        # Real shares first, then demos; newest within each.
        .order_by(
            UserScript.is_sample.asc(),
            func.coalesce(UserScript.updated_at, UserScript.created_at).desc(),
        )
        .limit(limit)
        .all()
    )

    scripts: List[CommunityScript] = []
    for script, user, profile in rows:
        owner = (profile.name if profile else None) or (user.name if user else None)
        titles = [s.title for s in (script.scenes or [])][:4]
        scripts.append(
            CommunityScript(
                id=script.id,
                title=script.title,
                author=script.author,
                genre=script.genre,
                owner_name="ActorRise" if script.is_sample else _first_name(owner),
                scene_count=script.num_scenes_extracted or len(script.scenes or []),
                character_count=script.num_characters or 0,
                scene_titles=titles,
                shared_at=script.updated_at or script.created_at,
                is_demo=bool(script.is_sample),
            )
        )

    # "ready" reflects real community shares only — demos seed the shelf but the
    # "still gathering" nudge stays until actors have shared >= MIN of their own.
    total = (
        db.query(func.count(UserScript.id))
        .filter(UserScript.shared_with_community.is_(True))
        .scalar()
    ) or 0

    return CommunityLibraryResponse(
        scripts=scripts,
        total=total,
        ready=total >= COMMUNITY_LIBRARY_MIN,
    )


class RoomLine(BaseModel):
    line_order: int
    character_name: str
    text: str


class RoomScene(BaseModel):
    id: int
    title: str
    character_1_name: str
    character_2_name: str
    line_count: int
    lines: List[RoomLine]


class CommunityScriptDetail(BaseModel):
    id: int
    title: str
    author: str
    owner_name: str
    is_demo: bool
    scenes: List[RoomScene]


@router.get("/scripts/{script_id}", response_model=CommunityScriptDetail)
def get_community_script(script_id: int, db: Session = Depends(get_db)):
    """A shared (or demo) script with its scenes + lines, for rehearsal rooms.
    Public read, but ONLY for scripts the owner shared (or system demos)."""
    script = (
        db.query(UserScript)
        .filter(
            UserScript.id == script_id,
            or_(
                UserScript.shared_with_community.is_(True),
                UserScript.is_sample.is_(True),
            ),
        )
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Script not found or not shared")

    owner = None
    if script.user_id and not script.is_sample:
        prof = db.query(ActorProfile).filter(ActorProfile.user_id == script.user_id).first()
        usr = db.query(User).filter(User.id == script.user_id).first()
        owner = (prof.name if prof else None) or (usr.name if usr else None)

    scenes = [
        RoomScene(
            id=sc.id,
            title=sc.title,
            character_1_name=sc.character_1_name,
            character_2_name=sc.character_2_name,
            line_count=sc.line_count,
            lines=[
                RoomLine(line_order=ln.line_order, character_name=ln.character_name, text=ln.text)
                for ln in sorted(sc.lines, key=lambda l: l.line_order)
            ],
        )
        for sc in (script.scenes or [])
    ]

    return CommunityScriptDetail(
        id=script.id,
        title=script.title,
        author=script.author,
        owner_name="ActorRise" if script.is_sample else _first_name(owner),
        is_demo=bool(script.is_sample),
        scenes=scenes,
    )


class RoomActivityRequest(BaseModel):
    title: str


@router.post("/room-activity")
def post_room_activity(
    body: RoomActivityRequest,
    current_user: User = Depends(get_current_user),
):
    """Fired once by a room when a partner joins → a live 'rehearsing together'
    beat on the Callboard. Fire-and-forget; the caller's own identity."""
    from app.services.community import record_event

    record_event(int(current_user.id), "rehearsing", title=(body.title or "")[:120])
    return {"ok": True}


class RoomInviteRequest(BaseModel):
    email: str
    room_id: str
    script_id: int
    scene_title: Optional[str] = None


@router.post("/room-invite")
def send_room_invite(
    body: RoomInviteRequest,
    current_user: User = Depends(get_current_user),
):
    """Email a friend a link to a rehearsal room (Canva-style invite). The room
    URL is built server-side so this can't be used to send arbitrary links."""
    email = (body.email or "").strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="That doesn't look like an email address.")

    import os

    if not os.getenv("RESEND_API_KEY"):
        return {"sent": False, "reason": "email_not_configured"}

    inviter = _first_name(current_user.name)
    url = f"https://actorrise.com/greenroom/room/{body.room_id}?script={body.script_id}"
    scene = (body.scene_title or "").strip()

    html = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#1a1a1a">
      <p style="font-size:16px;line-height:1.5">{inviter} wants to rehearse a scene with you on ActorRise.</p>
      {f'<p style="font-size:15px;color:#555;margin:0 0 8px">Scene: <strong>{scene}</strong></p>' if scene else ''}
      <p style="margin:24px 0">
        <a href="{url}" style="display:inline-block;background:#CB4B00;color:#fff;padding:13px 22px;border-radius:9999px;text-decoration:none;font-weight:600">Join the rehearsal room</a>
      </p>
      <p style="font-size:13px;color:#888">Or open this link: <a href="{url}" style="color:#CB4B00">{url}</a></p>
    </div>
    """

    try:
        from app.services.email.resend_client import ResendEmailClient

        ResendEmailClient().send_email(
            to=email,
            subject=f"{inviter} invited you to rehearse a scene on ActorRise",
            html=html,
        )
        return {"sent": True}
    except Exception:
        return {"sent": False, "reason": "send_failed"}


class ShareSettingRequest(BaseModel):
    share_activity: bool


@router.get("/settings")
def get_settings(current_user: User = Depends(get_current_user)):
    """The caller's own Green Room visibility (drives the opt-out toggle)."""
    return {"share_activity": bool(current_user.share_activity)}


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
