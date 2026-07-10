"""
API routes for the monologue "work" flow (X).

For now: transcript-aware delivery feedback. The session counter + paywall gate
land in a later increment; this endpoint is auth-only.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.actor import Monologue
from app.services.ai.langchain.monologue_coach import get_monologue_coach

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/monologue-work", tags=["monologue-work"])


class AnalyzeRunRequest(BaseModel):
    monologue_id: int
    transcript: str
    duration_seconds: Optional[float] = None


class DeliveryFeedbackResponse(BaseModel):
    rating: int
    overall_notes: str
    line_accuracy: Optional[str] = None
    pacing: Optional[str] = None
    emotional_tone: Optional[str] = None
    tips: Optional[List[str]] = None


@router.post("/analyze", response_model=DeliveryFeedbackResponse)
def analyze_run(
    request: AnalyzeRunRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monologue = db.query(Monologue).filter(Monologue.id == request.monologue_id).first()
    if not monologue:
        raise HTTPException(status_code=404, detail="Monologue not found")

    coach = get_monologue_coach()
    try:
        feedback = coach.analyze_transcript(
            transcript=request.transcript,
            reference_text=monologue.text,
            title=monologue.title,
            character_name=monologue.character_name,
            tone=monologue.tone,
            primary_emotion=monologue.primary_emotion,
            duration_seconds=request.duration_seconds,
        )
    except Exception as e:  # noqa: BLE001 — surface a clean 502 instead of a 500 stacktrace
        logger.error(f"monologue-work analyze failed: {e}")
        raise HTTPException(status_code=502, detail="Could not generate notes right now.")

    return DeliveryFeedbackResponse(**feedback)
