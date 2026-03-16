"""
Audition Mode API Endpoints

Self-tape recording analysis with AI casting director feedback.
Tier-limited: Free (1/mo), Solo (10/mo), Plus (30/mo), Pro (60/mo).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import Monologue
from app.models.billing import UserSubscription
from app.models.user import User
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
    """Request to analyze an audition performance."""
    monologue_id: Optional[int] = None
    duration: int  # Performance duration in seconds
    # Future: transcription text from Whisper, frame analysis from GPT-4o vision


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
    """
    Count AI feedback uses for the current calendar month.

    For now, we track via a simple counter approach.
    TODO: Create a dedicated usage tracking table for audition feedback.
    """
    # Placeholder — will be replaced with actual usage tracking
    return 0


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
    Analyze an audition performance and provide AI casting director feedback.

    Tier limits: Free 1/mo, Solo 10/mo, Plus 30/mo, Pro 60/mo.

    Current implementation: text + timing analysis via GPT-4o-mini (~$0.001).
    Future: Whisper transcription + GPT-4o vision frame analysis (~$0.05).
    """
    # Minimum recording duration — don't waste a credit on very short takes
    MIN_DURATION_SECONDS = 30
    if request.duration < MIN_DURATION_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Recording must be at least {MIN_DURATION_SECONDS} seconds for AI feedback.",
        )

    # Check tier limits
    tier = _get_user_tier(db, current_user)
    limit = FEEDBACK_LIMITS.get(tier, 1)
    used = _get_feedback_usage_this_month(db, current_user.id)

    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"AI feedback limit reached ({used}/{limit} this month). Upgrade your plan for more.",
        )

    # Get the monologue if provided
    monologue = None
    if request.monologue_id:
        monologue = db.query(Monologue).filter(Monologue.id == request.monologue_id).first()
        if not monologue:
            raise HTTPException(status_code=404, detail="Monologue not found")

    # Get audition coach
    coach = get_audition_coach()

    try:
        if monologue:
            feedback = coach.analyze_audition(
                monologue_title=monologue.title,
                character_name=monologue.character_name,
                play_title=monologue.play_title,
                monologue_text=monologue.text,
                duration=request.duration,
                genre=monologue.genre or "Drama",
            )
        else:
            # Generic feedback without monologue context
            feedback = coach.analyze_audition(
                monologue_title="Self-tape",
                character_name="Unknown",
                play_title="Unknown",
                monologue_text="",
                duration=request.duration,
                genre="Drama",
            )

        # TODO: Increment usage counter
        # _record_feedback_usage(db, current_user.id)

        return AuditionFeedbackResponse(**feedback)

    except Exception as e:
        logger.exception("Audition analysis failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to analyze audition. Please try again.",
        )
