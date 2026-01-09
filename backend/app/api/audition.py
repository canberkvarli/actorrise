"""
Audition Mode API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.actor import Monologue
from app.models.user import User
from app.services.ai.langchain.audition_coach import get_audition_coach

router = APIRouter(prefix="/api/audition", tags=["audition"])


class AnalyzeAuditionRequest(BaseModel):
    """Request to analyze an audition performance"""
    monologue_id: int
    duration: int  # Performance duration in seconds


class AuditionFeedbackResponse(BaseModel):
    """AI casting director feedback response"""
    rating: int
    strengths: list[str]
    areas_for_improvement: list[str]
    overall_notes: str


@router.post("/analyze", response_model=AuditionFeedbackResponse)
async def analyze_audition(
    request: AnalyzeAuditionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Analyze an audition performance and provide AI casting director feedback

    **FREE** - Uses GPT-4o-mini for analysis (~$0.0001 per audition)

    In production, this would accept video upload and perform:
    - Audio transcription
    - Visual analysis (body language, expression)
    - Pacing analysis

    For MVP, analyzes based on timing and monologue content.
    """
    # Get the monologue
    monologue = db.query(Monologue).filter(Monologue.id == request.monologue_id).first()

    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    # Get audition coach
    coach = get_audition_coach()

    try:
        # Analyze the audition
        feedback = coach.analyze_audition(
            monologue_title=monologue.title,
            character_name=monologue.character_name,
            play_title=monologue.play_title,
            monologue_text=monologue.text,
            duration=request.duration,
            genre=monologue.genre or "Drama"
        )

        return AuditionFeedbackResponse(**feedback)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze audition: {str(e)}"
        )
