"""
Admin endpoints for finding and editing monologues.

Allows moderators to:
- Look up monologues by ID or by search (title, character, play title)
- Edit monologue content (e.g. fix corrupted data from user reports)
"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.actor import Monologue, MonologueFavorite, Play
from app.models.moderation import MonologueSubmission


router = APIRouter(prefix="/api/admin/monologues", tags=["admin", "monologues"])


def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions",
        )
    return current_user


class TextSegment(BaseModel):
    type: Literal["dialogue", "interjection", "direction"]
    speaker: Optional[str] = None
    text: str


# Response: same shape as public MonologueResponse for reuse in UI
class AdminMonologueResponse(BaseModel):
    id: int
    title: str
    character_name: str
    text: str
    stage_directions: Optional[str]
    text_segments: Optional[List[TextSegment]] = None
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
        text_segments=m.text_segments,
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


class ReviewItem(BaseModel):
    """A monologue flagged by the repair pass for manual review."""

    id: int
    title: str
    character_name: str
    play_title: str
    play_id: int
    author: str
    source_type: str
    text: str  # current (broken) text
    proposed_text: Optional[str]  # AI's best attempt, may be None/empty
    review_reasons: List[str]
    word_count: int

    class Config:
        from_attributes = True


def _clear_review(mono: Monologue) -> None:
    mono.review_status = None
    mono.review_reasons = None
    mono.proposed_text = None


@router.get("/review", response_model=List[ReviewItem])
def admin_list_review_queue(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """List monologues flagged `review_status='pending'` by the repair pass.

    These are broken monologues the auto-repair could not safely clean — each is
    shown with the AI's proposed fix (if any) and the residual quality reasons so
    a moderator can approve, hand-edit, or delete it.
    """
    rows = (
        db.query(Monologue)
        .join(Play, Monologue.play_id == Play.id)
        .filter(Monologue.review_status == "pending")
        .order_by(Monologue.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    items: List[ReviewItem] = []
    for m in rows:
        items.append(
            ReviewItem(
                id=m.id,
                title=m.title,
                character_name=m.character_name,
                play_title=m.play.title,
                play_id=m.play.id,
                author=m.play.author,
                source_type=m.play.source_type,
                text=m.text,
                proposed_text=m.proposed_text,
                review_reasons=list(m.review_reasons) if m.review_reasons else [],
                word_count=m.word_count,
            )
        )
    return items


@router.get("/review/count")
def admin_review_queue_count(
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """Number of monologues awaiting manual review (for the admin nav badge)."""
    n = db.query(Monologue).filter(Monologue.review_status == "pending").count()
    return {"count": n}


@router.post("/{monologue_id:int}/review/approve", response_model=AdminMonologueResponse)
def admin_approve_proposed_text(
    monologue_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """Accept the AI's `proposed_text` as the monologue's new text.

    Recomputes word_count + duration and clears the review flags. 409 if there is
    no proposed text to approve (use PATCH to hand-edit, or DELETE to remove).
    """
    mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not mono:
        raise HTTPException(status_code=404, detail="Monologue not found")
    if not (mono.proposed_text and mono.proposed_text.strip()):
        raise HTTPException(
            status_code=409,
            detail="No proposed text to approve; edit manually or delete instead.",
        )

    from app.utils.duration import estimate_duration_seconds

    mono.text = mono.proposed_text
    mono.word_count = len(mono.text.split())
    mono.estimated_duration_seconds = estimate_duration_seconds(mono.text)
    _clear_review(mono)
    db.commit()
    db.refresh(mono)
    return _mono_to_admin_response(mono)


@router.post("/{monologue_id:int}/review/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def admin_dismiss_review(
    monologue_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """Remove a monologue from the review queue without changing its text.

    Use when the flag is a false positive and the existing text is acceptable.
    """
    mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not mono:
        raise HTTPException(status_code=404, detail="Monologue not found")
    _clear_review(mono)
    db.commit()
    return None


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
    estimated_duration_seconds are recomputed, and any review flag is cleared.
    """
    mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not mono:
        raise HTTPException(status_code=404, detail="Monologue not found")

    update = body.model_dump(exclude_unset=True)
    if "text" in update:
        text = update["text"]
        update["word_count"] = len(text.split())
        from app.utils.duration import estimate_duration_seconds
        update["estimated_duration_seconds"] = estimate_duration_seconds(text)
        # A hand-edit of the text resolves any pending review flag.
        _clear_review(mono)

    for key, value in update.items():
        setattr(mono, key, value)

    db.commit()
    db.refresh(mono)
    return _mono_to_admin_response(mono)


@router.delete("/{monologue_id:int}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_monologue(
    monologue_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_moderator),
):
    """
    Permanently delete a monologue. Removes favorites and unlinks from submissions.
    """
    mono = db.query(Monologue).filter(Monologue.id == monologue_id).first()
    if not mono:
        raise HTTPException(status_code=404, detail="Monologue not found")

    db.query(MonologueFavorite).filter(MonologueFavorite.monologue_id == monologue_id).delete(
        synchronize_session=False
    )
    db.query(MonologueSubmission).filter(
        MonologueSubmission.monologue_id == monologue_id
    ).update({MonologueSubmission.monologue_id: None}, synchronize_session=False)
    db.delete(mono)
    db.commit()
    return None
