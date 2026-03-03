"""Admin API endpoints for managing founding actors."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.founding_actors import generate_slug
from app.core.database import get_db
from app.models.founding_actor import FoundingActor
from app.models.user import User

router = APIRouter(prefix="/api/admin/founding-actors", tags=["admin", "founding-actors"])


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if current_user.is_moderator is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class FoundingActorCreate(BaseModel):
    name: str
    slug: Optional[str] = None  # Auto-generated from name if not provided
    descriptor: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    social_links: dict = {}
    headshots: list = []
    display_order: int = 0
    is_published: bool = False
    source: Optional[str] = None
    user_id: Optional[int] = None


class FoundingActorPatch(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    descriptor: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    social_links: Optional[dict] = None
    headshots: Optional[list] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None
    source: Optional[str] = None


class LinkUserRequest(BaseModel):
    user_id: int


class AdminFoundingActorResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    name: str
    slug: str
    descriptor: Optional[str] = None
    bio: Optional[str] = None
    quote: Optional[str] = None
    social_links: dict = {}
    headshots: list = []
    display_order: int = 0
    is_published: bool = False
    source: Optional[str] = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[AdminFoundingActorResponse])
def list_all_founding_actors(
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """List all founding actors (including unpublished)."""
    return (
        db.query(FoundingActor)
        .order_by(FoundingActor.display_order)
        .all()
    )


@router.post("", response_model=AdminFoundingActorResponse, status_code=status.HTTP_201_CREATED)
def create_founding_actor(
    body: FoundingActorCreate,
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Create a new founding actor."""
    slug = body.slug or generate_slug(body.name)

    # Check slug uniqueness
    existing = db.query(FoundingActor).filter(FoundingActor.slug == slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Slug '{slug}' already exists",
        )

    actor = FoundingActor(
        name=body.name,
        slug=slug,
        descriptor=body.descriptor,
        bio=body.bio,
        quote=body.quote,
        social_links=body.social_links,
        headshots=body.headshots,
        display_order=body.display_order,
        is_published=body.is_published,
        source=body.source,
        user_id=body.user_id,
    )
    db.add(actor)
    db.commit()
    db.refresh(actor)
    return actor


@router.patch("/{actor_id}", response_model=AdminFoundingActorResponse)
def update_founding_actor(
    actor_id: int,
    body: FoundingActorPatch,
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Update any field on a founding actor."""
    actor = db.query(FoundingActor).filter(FoundingActor.id == actor_id).first()
    if not actor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    update_data = body.model_dump(exclude_unset=True)

    # If slug is being changed, check uniqueness
    if "slug" in update_data and update_data["slug"] != actor.slug:
        existing = db.query(FoundingActor).filter(FoundingActor.slug == update_data["slug"]).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Slug '{update_data['slug']}' already exists",
            )

    for key, value in update_data.items():
        setattr(actor, key, value)
    db.commit()
    db.refresh(actor)
    return actor


@router.delete("/{actor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_founding_actor(
    actor_id: int,
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Delete a founding actor."""
    actor = db.query(FoundingActor).filter(FoundingActor.id == actor_id).first()
    if not actor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    db.delete(actor)
    db.commit()


@router.post("/{actor_id}/link-user", response_model=AdminFoundingActorResponse)
def link_user_to_founding_actor(
    actor_id: int,
    body: LinkUserRequest,
    _admin: User = Depends(require_moderator),
    db: Session = Depends(get_db),
):
    """Link a founding actor to an existing user account."""
    actor = db.query(FoundingActor).filter(FoundingActor.id == actor_id).first()
    if not actor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    user = db.query(User).filter(User.id == body.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check if user is already linked to another founding actor
    existing = (
        db.query(FoundingActor)
        .filter(FoundingActor.user_id == body.user_id, FoundingActor.id != actor_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already linked to another founding actor",
        )

    actor.user_id = body.user_id
    db.commit()
    db.refresh(actor)
    return actor
