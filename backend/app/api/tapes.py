"""
Self-Tape Management API Endpoints

CRUD for saved tapes (Plus/Pro) and public sharing (Pro).
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.billing import UserSubscription
from app.models.tape import UserTape
from app.models.user import User
from app.services.benefits import get_effective_benefits
from app.services.storage import delete_tape_file, upload_tape

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/tapes", tags=["tapes"])

# Tier limits for saved tapes
SAVE_LIMITS = {
    "free": 0,
    "solo": 0,
    "plus": 15,
    "pro": 50,
}

# Storage quota per tier (in bytes)
STORAGE_QUOTAS = {
    "free": 0,
    "solo": 0,
    "plus": 2 * 1024 * 1024 * 1024,    # 2 GB
    "pro": 5 * 1024 * 1024 * 1024,      # 5 GB
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per upload


# --- Pydantic models ---

class TapeCreate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    duration_seconds: Optional[int] = None
    file_path: str
    file_size_bytes: Optional[int] = None
    monologue_id: Optional[int] = None
    script_id: Optional[int] = None


class TapeUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None


class TapeResponse(BaseModel):
    id: int
    title: Optional[str]
    notes: Optional[str]
    duration_seconds: Optional[int]
    file_path: str
    file_size_bytes: Optional[int]
    share_uuid: UUID
    is_shared: bool
    ai_feedback: Optional[dict]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TapeListResponse(BaseModel):
    tapes: list[TapeResponse]
    count: int
    limit: int


class PublicTapeResponse(BaseModel):
    id: int
    title: Optional[str]
    duration_seconds: Optional[int]
    file_path: str
    created_at: datetime
    actor_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Helpers ---

def _get_user_tier(db: Session, user: User) -> str:
    """Get the user's current tier name."""
    sub = db.query(UserSubscription).filter(
        UserSubscription.user_id == user.id,
        UserSubscription.status.in_(("active", "trialing")),
    ).first()
    if sub and sub.tier:
        return sub.tier.name
    return "free"


def _get_tape_count(db: Session, user_id: int) -> int:
    """Count user's saved tapes."""
    return db.query(UserTape).filter(UserTape.user_id == user_id).count()


def _get_storage_used(db: Session, user_id: int) -> int:
    """Sum of file_size_bytes for all user tapes."""
    from sqlalchemy import func
    result = db.query(func.coalesce(func.sum(UserTape.file_size_bytes), 0)).filter(
        UserTape.user_id == user_id
    ).scalar()
    return int(result)


# --- Endpoints ---

@router.get("", response_model=TapeListResponse)
async def list_tapes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all saved tapes for the current user."""
    tier = _get_user_tier(db, current_user)
    save_limit = SAVE_LIMITS.get(tier, 0)

    if save_limit == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tape library requires Plus or Pro plan",
        )

    tapes = (
        db.query(UserTape)
        .filter(UserTape.user_id == current_user.id)
        .order_by(UserTape.created_at.desc())
        .all()
    )

    return TapeListResponse(
        tapes=tapes,
        count=len(tapes),
        limit=save_limit,
    )


@router.get("/usage")
async def get_storage_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the user's tape storage usage and quota."""
    tier = _get_user_tier(db, current_user)
    storage_used = _get_storage_used(db, current_user.id)
    storage_quota = STORAGE_QUOTAS.get(tier, 0)
    tape_count = _get_tape_count(db, current_user.id)
    tape_limit = SAVE_LIMITS.get(tier, 0)

    return {
        "storage_used_bytes": storage_used,
        "storage_quota_bytes": storage_quota,
        "tape_count": tape_count,
        "tape_limit": tape_limit,
        "tier": tier,
    }


@router.post("", response_model=TapeResponse, status_code=status.HTTP_201_CREATED)
async def create_tape(
    tape_data: TapeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a new tape to the library. Requires Plus or Pro plan."""
    tier = _get_user_tier(db, current_user)
    save_limit = SAVE_LIMITS.get(tier, 0)

    if save_limit == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Saving tapes requires Plus or Pro plan",
        )

    current_count = _get_tape_count(db, current_user.id)
    if current_count >= save_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tape limit reached ({current_count}/{save_limit}). Delete a tape or upgrade your plan.",
        )

    tape = UserTape(
        user_id=current_user.id,
        title=tape_data.title,
        notes=tape_data.notes,
        duration_seconds=tape_data.duration_seconds,
        file_path=tape_data.file_path,
        file_size_bytes=tape_data.file_size_bytes,
        monologue_id=tape_data.monologue_id,
        script_id=tape_data.script_id,
    )
    db.add(tape)
    db.commit()
    db.refresh(tape)

    return tape


@router.post("/upload", response_model=TapeResponse, status_code=status.HTTP_201_CREATED)
async def upload_and_create_tape(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    duration_seconds: Optional[int] = Form(None),
    ai_feedback: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a video file and create a tape in one step.

    Accepts multipart form data with the video file and metadata.
    Uploads to Supabase Storage, then creates the UserTape record.
    """
    tier = _get_user_tier(db, current_user)
    save_limit = SAVE_LIMITS.get(tier, 0)

    if save_limit == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Saving tapes requires Plus or Pro plan",
        )

    current_count = _get_tape_count(db, current_user.id)
    if current_count >= save_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tape limit reached ({current_count}/{save_limit}). Delete a tape or upgrade your plan.",
        )

    # Read and upload video
    video_bytes = await file.read()
    content_type = file.content_type or "video/webm"

    # Check file size limit (50 MB)
    if len(video_bytes) > MAX_FILE_SIZE:
        size_mb = len(video_bytes) / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({size_mb:.0f} MB). Maximum is 50 MB per upload.",
        )

    # Check storage quota
    storage_quota = STORAGE_QUOTAS.get(tier, 0)
    storage_used = _get_storage_used(db, current_user.id)
    if storage_used + len(video_bytes) > storage_quota:
        used_mb = storage_used / (1024 * 1024)
        quota_mb = storage_quota / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Storage limit reached ({used_mb:.0f} MB / {quota_mb:.0f} MB). Delete old tapes or upgrade your plan.",
        )

    try:
        file_path = upload_tape(video_bytes, current_user.id, content_type)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Parse AI feedback JSON if provided
    import json
    feedback_dict = None
    if ai_feedback:
        try:
            feedback_dict = json.loads(ai_feedback)
        except json.JSONDecodeError:
            pass

    tape = UserTape(
        user_id=current_user.id,
        title=title or f"Self-tape {datetime.now(timezone.utc).strftime('%b %d, %Y')}",
        duration_seconds=duration_seconds,
        file_path=file_path,
        file_size_bytes=len(video_bytes),
        ai_feedback=feedback_dict,
    )
    db.add(tape)
    db.commit()
    db.refresh(tape)

    return tape


@router.get("/{tape_id}", response_model=TapeResponse)
async def get_tape(
    tape_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single tape by ID."""
    tape = db.query(UserTape).filter(
        UserTape.id == tape_id,
        UserTape.user_id == current_user.id,
    ).first()

    if not tape:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tape not found")

    return tape


@router.patch("/{tape_id}", response_model=TapeResponse)
async def update_tape(
    tape_id: int,
    updates: TapeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update tape title or notes."""
    tape = db.query(UserTape).filter(
        UserTape.id == tape_id,
        UserTape.user_id == current_user.id,
    ).first()

    if not tape:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tape not found")

    if updates.title is not None:
        tape.title = updates.title
    if updates.notes is not None:
        tape.notes = updates.notes

    db.commit()
    db.refresh(tape)
    return tape


@router.delete("/{tape_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tape(
    tape_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a tape. Also removes from storage (TODO: Supabase Storage cleanup)."""
    tape = db.query(UserTape).filter(
        UserTape.id == tape_id,
        UserTape.user_id == current_user.id,
    ).first()

    if not tape:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tape not found")

    # Delete file from Supabase Storage
    delete_tape_file(tape.file_path)

    db.delete(tape)
    db.commit()


@router.post("/{tape_id}/share", response_model=dict)
async def share_tape(
    tape_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a share link for a tape. Pro only."""
    tier = _get_user_tier(db, current_user)

    if tier != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sharing tapes requires Pro plan",
        )

    tape = db.query(UserTape).filter(
        UserTape.id == tape_id,
        UserTape.user_id == current_user.id,
    ).first()

    if not tape:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tape not found")

    tape.is_shared = True
    db.commit()

    return {"share_url": f"/tape/{tape.share_uuid}"}


@router.delete("/{tape_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def unshare_tape(
    tape_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a share link."""
    tape = db.query(UserTape).filter(
        UserTape.id == tape_id,
        UserTape.user_id == current_user.id,
    ).first()

    if not tape:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tape not found")

    tape.is_shared = False
    db.commit()
