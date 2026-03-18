"""
Audition Mode API Endpoints

Self-tape recording analysis with AI casting director feedback.
Uses GPT-4o Vision to analyze actual video frames.
Tier-limited: Free (1/mo), Solo (10/mo), Plus (30/mo), Pro (60/mo).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import Monologue
from app.models.billing import UserSubscription
from app.models.user import User
from app.models.audition_usage import AuditionFeedbackUsage
from app.services.ai.langchain.audition_coach import get_audition_coach

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/audition", tags=["audition"])

# AI feedback limits per tier per month
FEEDBACK_LIMITS = {
    "free": 1,
    "solo": 10,
    "plus": 30,
    "pro": 60,
}


# --- Pydantic models ---

class AnalyzeAuditionRequest(BaseModel):
    """Request to analyze an audition performance with video frames."""
    frames: list[str] = Field(
        ...,
        min_length=1,
        max_length=10,
        description="Base64-encoded JPEG frames from the video (1-10 frames)",
    )
    duration: int = Field(..., ge=30, description="Recording duration in seconds (min 30)")
    monologue_id: Optional[int] = None


class AuditionFeedbackResponse(BaseModel):
    """AI casting director feedback response."""
    rating: int
    strengths: list[str]
    areas_for_improvement: list[str]
    overall_notes: str
    line_accuracy: Optional[str] = None
    pacing: Optional[str] = None
    emotional_tone: Optional[str] = None
    framing: Optional[str] = None
    tips: Optional[list[str]] = None


class FeedbackUsageResponse(BaseModel):
    """Current month's feedback usage."""
    used: int
    limit: int
    remaining: int
    tier: str


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


def _get_feedback_usage_this_month(db: Session, user_id: int) -> int:
    """Count AI feedback uses for the current calendar month."""
    now = datetime.now(timezone.utc)
    count = db.query(func.count(AuditionFeedbackUsage.id)).filter(
        AuditionFeedbackUsage.user_id == user_id,
        extract("year", AuditionFeedbackUsage.created_at) == now.year,
        extract("month", AuditionFeedbackUsage.created_at) == now.month,
    ).scalar()
    return count or 0


def _record_feedback_usage(db: Session, user_id: int) -> None:
    """Record a feedback usage event."""
    usage = AuditionFeedbackUsage(user_id=user_id)
    db.add(usage)
    db.commit()


# --- Endpoints ---

@router.get("/usage", response_model=FeedbackUsageResponse)
async def get_feedback_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the user's AI feedback usage for this month."""
    tier = _get_user_tier(db, current_user)
    limit = FEEDBACK_LIMITS.get(tier, 1)
    used = _get_feedback_usage_this_month(db, current_user.id)

    return FeedbackUsageResponse(
        used=used,
        limit=limit,
        remaining=max(0, limit - used),
        tier=tier,
    )


@router.post("/analyze", response_model=AuditionFeedbackResponse)
async def analyze_audition(
    request: AnalyzeAuditionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze a self-tape using GPT-4o Vision on actual video frames.

    The client extracts 6 frames from the recorded video and sends them as base64 JPEGs.
    GPT-4o Vision analyzes framing, lighting, body language, expressions, and overall performance.

    Cost: ~$0.03 per analysis (6 frames at low detail).
    """
    # Check tier limits
    tier = _get_user_tier(db, current_user)
    limit = FEEDBACK_LIMITS.get(tier, 1)
    used = _get_feedback_usage_this_month(db, current_user.id)

    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"AI feedback limit reached ({used}/{limit} this month). Upgrade your plan for more.",
        )

    # Get optional monologue context
    monologue = None
    if request.monologue_id:
        monologue = db.query(Monologue).filter(Monologue.id == request.monologue_id).first()

    coach = get_audition_coach()

    try:
        feedback = coach.analyze_with_frames(
            frames_base64=request.frames,
            duration=request.duration,
            monologue_title=monologue.title if monologue else None,
            monologue_text=monologue.text if monologue else None,
            character_name=monologue.character_name if monologue else None,
        )

        # Record usage
        _record_feedback_usage(db, current_user.id)

        return AuditionFeedbackResponse(**feedback)

    except Exception as e:
        logger.exception("Audition analysis failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze audition. Please try again.",
        )
