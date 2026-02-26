"""
TTS endpoint for Scene Partner.
Converts AI character dialogue to spoken audio using OpenAI gpt-4o-mini-tts.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.rate_limiting import FeatureGate
from app.models.user import User
from app.services.tts_service import VOICE_PROFILES, TTSService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["speech"])

VALID_FORMATS = {"mp3", "opus", "aac", "flac", "wav", "pcm"}
CONTENT_TYPE_MAP = {
    "mp3": "audio/mpeg",
    "opus": "audio/opus",
    "aac": "audio/aac",
    "flac": "audio/flac",
    "wav": "audio/wav",
    "pcm": "audio/pcm",
}


class SpeechRequest(BaseModel):
    """Request to synthesize speech for a scene partner line."""

    text: str = Field(..., min_length=1, max_length=2000)
    voice: str = Field(default="coral")
    instructions: str = Field(default="", max_length=2000)
    response_format: str = Field(default="mp3")


@router.post("/synthesize")
async def synthesize_speech(
    request: SpeechRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _gate: bool = Depends(FeatureGate("scene_partner", increment=False)),
):
    """
    Synthesize speech for a scene partner dialogue line.

    Uses auto-generated TTS instructions from the scene partner LLM
    for emotionally appropriate delivery.

    Rate-limited by scene_partner gate (no extra increment — the
    deliver_line endpoint already counted the session).
    """
    if request.voice not in VOICE_PROFILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid voice. Choose from: {', '.join(VOICE_PROFILES.keys())}",
        )

    if request.response_format not in VALID_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid format. Choose from: {', '.join(VALID_FORMATS)}",
        )

    try:
        tts = TTSService()
        audio_stream = tts.synthesize_speech_streaming(
            text=request.text,
            voice=request.voice,
            instructions=request.instructions,
            response_format=request.response_format,
        )

        return StreamingResponse(
            audio_stream,
            media_type=CONTENT_TYPE_MAP.get(request.response_format, "audio/mpeg"),
            headers={
                "Content-Disposition": f"inline; filename=speech.{request.response_format}",
                "Cache-Control": "no-cache",
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    except Exception as e:
        logger.exception("TTS synthesis failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TTS synthesis failed. Please try again.",
        )


@router.get("/voices")
async def list_voices(
    current_user: User = Depends(get_current_user),
):
    """List available TTS voices with their characteristics."""
    return {
        "voices": [
            {"id": vid, **profile} for vid, profile in VOICE_PROFILES.items()
        ]
    }
