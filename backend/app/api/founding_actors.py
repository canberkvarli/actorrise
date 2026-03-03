"""Public and authenticated founding actor API endpoints."""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.founding_actor import FoundingActor
from app.models.user import User
from app.services.storage import (
    delete_founding_actor_headshot,
    upload_founding_actor_headshot,
)

router = APIRouter(prefix="/api/founding-actors", tags=["founding-actors"])

MAX_HEADSHOTS = 3


def generate_slug(name: str) -> str:
    """Convert 'Canberk Varli' to 'canberk-varli'."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^\w\s-]", "", ascii_name).strip().lower()
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class FoundingActorPublic(BaseModel):
    id: int
    name: str
    slug: str
    descriptor: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    social_links: dict = {}
    headshots: list = []
    display_order: int = 0
    source: Optional[str] = None

    class Config:
        from_attributes = True


class FoundingActorUpdate(BaseModel):
    """Fields an actor can update on their own page."""
    bio: Optional[str] = None
    descriptor: Optional[str] = None
    social_links: Optional[dict] = None
    quote: Optional[str] = None


class HeadshotUploadRequest(BaseModel):
    image: str  # Base64 encoded
    caption: Optional[str] = None


class SetPrimaryRequest(BaseModel):
    index: int


# ---------------------------------------------------------------------------
# Public endpoints (no auth)
# ---------------------------------------------------------------------------

@router.get("", response_model=list[FoundingActorPublic])
def list_founding_actors(db: Session = Depends(get_db)):
    """List all published founding actors, ordered by display_order."""
    actors = (
        db.query(FoundingActor)
        .filter(FoundingActor.is_published == True)  # noqa: E712
        .order_by(FoundingActor.display_order)
        .all()
    )
    return actors


@router.get("/me", response_model=FoundingActorPublic)
def get_my_founding_actor(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's founding actor profile."""
    actor = (
        db.query(FoundingActor)
        .filter(FoundingActor.user_id == current_user.id)
        .first()
    )
    if not actor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a founding actor",
        )
    return actor


@router.get("/{slug}", response_model=FoundingActorPublic)
def get_founding_actor(slug: str, db: Session = Depends(get_db)):
    """Get a single published founding actor by slug."""
    actor = (
        db.query(FoundingActor)
        .filter(FoundingActor.slug == slug, FoundingActor.is_published == True)  # noqa: E712
        .first()
    )
    if not actor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Founding actor not found",
        )
    return actor


# ---------------------------------------------------------------------------
# Authenticated self-edit endpoints
# ---------------------------------------------------------------------------

def _require_founding_actor(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[User, FoundingActor, Session]:
    actor = (
        db.query(FoundingActor)
        .filter(FoundingActor.user_id == current_user.id)
        .first()
    )
    if not actor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a founding actor",
        )
    return current_user, actor, db


@router.put("/me", response_model=FoundingActorPublic)
def update_my_founding_actor(
    body: FoundingActorUpdate,
    deps: tuple = Depends(_require_founding_actor),
):
    """Update founding actor page (bio, descriptor, social links). Changes go live immediately."""
    _user, actor, db = deps
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(actor, key, value)
    db.commit()
    db.refresh(actor)
    return actor


@router.post("/me/headshots", response_model=FoundingActorPublic)
def upload_my_headshot(
    body: HeadshotUploadRequest,
    deps: tuple = Depends(_require_founding_actor),
):
    """Upload a new headshot. Max 3 per founding actor."""
    user, actor, db = deps
    headshots = list(actor.headshots or [])
    if len(headshots) >= MAX_HEADSHOTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_HEADSHOTS} headshots allowed. Delete one first.",
        )

    index = len(headshots)
    url = upload_founding_actor_headshot(body.image, user.id, index)
    is_primary = len(headshots) == 0  # First headshot is automatically primary
    headshots.append({
        "url": url,
        "is_primary": is_primary,
        "caption": body.caption or "",
    })
    actor.headshots = headshots
    db.commit()
    db.refresh(actor)
    return actor


@router.delete("/me/headshots/{index}", response_model=FoundingActorPublic)
def delete_my_headshot(
    index: int,
    deps: tuple = Depends(_require_founding_actor),
):
    """Delete a headshot by index."""
    user, actor, db = deps
    headshots = list(actor.headshots or [])
    if index < 0 or index >= len(headshots):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Headshot index out of range",
        )

    removed = headshots.pop(index)
    # If the removed headshot was primary and there are others, make the first one primary
    if removed.get("is_primary") and headshots:
        headshots[0]["is_primary"] = True

    # Delete from storage if it's a Supabase URL
    if "supabase.co" in (removed.get("url") or ""):
        delete_founding_actor_headshot(user.id, index)

    actor.headshots = headshots
    db.commit()
    db.refresh(actor)
    return actor


@router.put("/me/headshots/primary", response_model=FoundingActorPublic)
def set_primary_headshot(
    body: SetPrimaryRequest,
    deps: tuple = Depends(_require_founding_actor),
):
    """Set which headshot is the primary one."""
    _user, actor, db = deps
    headshots = list(actor.headshots or [])
    if body.index < 0 or body.index >= len(headshots):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Headshot index out of range",
        )

    for i, h in enumerate(headshots):
        h["is_primary"] = i == body.index

    actor.headshots = headshots
    db.commit()
    db.refresh(actor)
    return actor
