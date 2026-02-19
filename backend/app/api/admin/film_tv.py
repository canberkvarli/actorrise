"""
Admin endpoints for Film/TV references.

Allows moderators to:
- Look up a film/TV reference by ID
- Update the script (IMSDb) URL override (e.g. when IMSDb uses "Godfather" but we display "The Godfather")
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.actor import FilmTvReference


router = APIRouter(prefix="/api/admin/film-tv", tags=["admin", "film-tv"])


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


class FilmTvAdminResponse(BaseModel):
    id: int
    title: str
    year: Optional[int] = None
    type: Optional[str] = None
    imdb_id: str
    imsdb_url: Optional[str] = None

    class Config:
        from_attributes = True


class FilmTvAdminUpdate(BaseModel):
    imsdb_url: Optional[str] = None


@router.get("", response_model=FilmTvAdminResponse)
def admin_get_film_tv(
    id: int = Query(..., description="Film/TV reference ID"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """Look up a single film/TV reference by ID (moderator only)."""
    ref = db.query(FilmTvReference).filter(FilmTvReference.id == id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Film/TV reference not found")
    return FilmTvAdminResponse(
        id=ref.id,
        title=ref.title,
        year=ref.year,
        type=ref.type,
        imdb_id=ref.imdb_id,
        imsdb_url=ref.imsdb_url,
    )


@router.patch("/{ref_id:int}", response_model=FilmTvAdminResponse)
def admin_update_film_tv(
    ref_id: int,
    body: FilmTvAdminUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """Update film/TV reference (e.g. set IMSDb script URL override). Only provided fields are updated."""
    ref = db.query(FilmTvReference).filter(FilmTvReference.id == ref_id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Film/TV reference not found")

    update = body.model_dump(exclude_unset=True)
    if "imsdb_url" in update:
        raw = update["imsdb_url"]
        ref.imsdb_url = (raw or "").strip() or None

    db.commit()
    db.refresh(ref)
    return FilmTvAdminResponse(
        id=ref.id,
        title=ref.title,
        year=ref.year,
        type=ref.type,
        imdb_id=ref.imdb_id,
        imsdb_url=ref.imsdb_url,
    )
