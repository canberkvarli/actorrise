"""
Admin endpoints for finding and editing monologues.

Allows moderators to:
- Look up monologues by ID or by search (title, character, play title)
- Edit monologue content (e.g. fix corrupted data from user reports)
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.actor import Monologue, Play


router = APIRouter(prefix="/api/admin/monologues", tags=["admin", "monologues"])


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


# Response: same shape as public MonologueResponse for reuse in UI
class AdminMonologueResponse(BaseModel):
    id: int
    title: str
    character_name: str
    text: str
    stage_directions: Optional[str]
    play_title: str
    play_id: int
    author: str
    category: str
    character_gender: Optional[str]
    character_age_range: Optional[str]
    primary_emotion: Optional[str]
    emotion_scores: Optional[dict]
    themes: Optional[List[str]]
    tone: Optional[str]
    difficulty_level: Optional[str]
    word_count: int
    estimated_duration_seconds: int
    view_count: int
    favorite_count: int
    overdone_score: float
    scene_description: Optional[str]
    act: Optional[int] = None
    scene: Optional[int] = None
    source_url: Optional[str] = None

    class Config:
        from_attributes = True


class AdminMonologueUpdate(BaseModel):
    """Fields that admins can edit (e.g. fix corrupted data)."""

    title: Optional[str] = None
    text: Optional[str] = None
    character_name: Optional[str] = None
    stage_directions: Optional[str] = None
    character_gender: Optional[str] = None
    character_age_range: Optional[str] = None
    primary_emotion: Optional[str] = None
    themes: Optional[List[str]] = None
    scene_description: Optional[str] = None


def _mono_to_admin_response(m: Monologue) -> AdminMonologueResponse:
    play = m.play
    return AdminMonologueResponse(
        id=m.id,
        title=m.title,
        character_name=m.character_name,
        text=m.text,
        stage_directions=m.stage_directions,
        play_title=play.title,
        play_id=play.id,
        author=play.author,
        category=play.category,
        character_gender=m.character_gender,
        character_age_range=m.character_age_range,
        primary_emotion=m.primary_emotion,
        emotion_scores=m.emotion_scores,
        themes=list(m.themes) if m.themes else [],
        tone=m.tone,
        difficulty_level=m.difficulty_level,
        word_count=m.word_count,
        estimated_duration_seconds=m.estimated_duration_seconds,
        view_count=m.view_count,
        favorite_count=m.favorite_count,
        overdone_score=float(m.overdone_score or 0),
        scene_description=m.scene_description,
        act=m.act,
        scene=m.scene,
        source_url=play.source_url,
    )


@router.get("", response_model=List[AdminMonologueResponse])
def admin_list_or_lookup_monologues(
    monologue_id: Optional[int] = Query(None, alias="id", description="Exact monologue ID"),
    q: Optional[str] = Query(None, max_length=200, description="Search by title, character, or play title"),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """
    Find monologues by ID or by search.
    - id=123 → return that monologue only (or 404).
    - q=... → search title, character_name, play title (ILIKE); return up to `limit` results.
    - If neither id nor q, return 400.
    """
    if monologue_id is not None:
        mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
        if not mono:
            raise HTTPException(status_code=404, detail="Monologue not found")
        return [_mono_to_admin_response(mono)]

    if not (q and q.strip()):
        raise HTTPException(
            status_code=400,
            detail="Provide id= or q= to find monologues",
        )

    term = f"%{q.strip()}%"
    query = (
        db.query(Monologue)
        .join(Play)
        .filter(
            or_(
                Monologue.title.ilike(term),
                Monologue.character_name.ilike(term),
                Play.title.ilike(term),
                Play.author.ilike(term),
            )
        )
        .order_by(Monologue.title, Play.title)
        .limit(limit)
    )
    results = query.all()
    return [_mono_to_admin_response(m) for m in results]


@router.patch("/{monologue_id:int}", response_model=AdminMonologueResponse)
def admin_update_monologue(
    monologue_id: int,
    body: AdminMonologueUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """
    Update a monologue (fix corrupted data, typos, etc.).
    Only provided fields are updated. If `text` is updated, word_count and
    estimated_duration_seconds are recomputed.
    """
    mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not mono:
        raise HTTPException(status_code=404, detail="Monologue not found")

    update = body.model_dump(exclude_unset=True)
    if "text" in update:
        text = update["text"]
        update["word_count"] = len(text.split())
        update["estimated_duration_seconds"] = int((update["word_count"] / 150.0) * 60)

    for key, value in update.items():
        setattr(mono, key, value)

    db.commit()
    db.refresh(mono)
    return _mono_to_admin_response(mono)
