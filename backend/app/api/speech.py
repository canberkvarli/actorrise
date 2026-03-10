"""
TTS + STT endpoints for Scene Partner.
Converts AI character dialogue to spoken audio (OpenAI TTS) and
transcribes user speech to text (OpenAI Whisper).
"""

import logging
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
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

    text: str = Field(..., min_length=1, max_length=4096)
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
                "Cache-Control": "private, max-age=3600",  # browser can cache for 1h
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


@router.post("/transcribe")
async def transcribe_speech(
    audio: UploadFile = File(...),
    prompt: Optional[str] = None,  # Expected line text — improves Whisper accuracy
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(FeatureGate("scene_partner", increment=False)),
):
    """Transcribe user speech using OpenAI Whisper-1."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    audio_data = await audio.read()
    if len(audio_data) < 500:
        return {"text": ""}

    # Determine file extension from filename (more reliable than content-type header)
    filename = audio.filename or ""
    content_type = audio.content_type or ""
    if filename.endswith(".m4a") or "mp4" in content_type or "m4a" in content_type:
        suffix = ".m4a"
    elif filename.endswith(".wav") or "wav" in content_type:
        suffix = ".wav"
    elif filename.endswith(".ogg") or "ogg" in content_type:
        suffix = ".ogg"
    else:
        suffix = ".webm"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_data)
            tmp_path = f.name

        client = OpenAI(api_key=settings.openai_api_key)
        with open(tmp_path, "rb") as f:
            kwargs: dict = dict(model="whisper-1", file=f, language="en")
            if prompt:
                # Hints Whisper toward the expected vocabulary (theatrical/dramatic language)
                kwargs["prompt"] = prompt[:224]  # Whisper prompt max ~224 tokens
            result = client.audio.transcriptions.create(**kwargs)
        return {"text": result.text.strip()}
    except Exception as e:
        err_str = str(e)
        # Whisper 400 = bad/empty audio file — treat as no speech rather than server error
        if "400" in err_str or "invalid_request_error" in err_str or "Invalid file format" in err_str:
            logger.warning("Whisper rejected audio (bad format/empty): %s", err_str)
            return {"text": ""}
        logger.exception("Whisper transcription failed: %s", e)
        raise HTTPException(status_code=500, detail="Transcription failed")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


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
