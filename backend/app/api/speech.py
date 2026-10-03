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
from app.middleware.burst_limiter import BurstLimiter
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
    _burst: bool = Depends(BurstLimiter("speech_synthesize")),
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


#: Transcription models, best first. The next one is tried only when a model
#: errors, never when it simply hears nothing.
#:
#: This was pinned to `whisper-1` (2022) until 2026-10-03. The rehearsal wall is
#: a transcription problem -- an actor says "I won't" and only "I" lights up --
#: and `gpt-4o-transcribe` is materially more accurate on short, emotional,
#: accented speech, which is the whole of what this endpoint ever receives.
#: whisper-1 stays last so a model outage degrades instead of failing.
TRANSCRIBE_MODELS = ("gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1")


@router.post("/transcribe")
async def transcribe_speech(
    audio: UploadFile = File(...),
    prompt: Optional[str] = None,  # Expected line text — improves Whisper accuracy
    current_user: User = Depends(get_current_user),
    _gate: bool = Depends(FeatureGate("scene_partner", increment=False)),
    _burst: bool = Depends(BurstLimiter("speech_transcribe")),
):
    """Transcribe what the actor said, with the line they were given as a hint."""
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
        text = ""
        last_error: Exception | None = None
        for model in TRANSCRIBE_MODELS:
            try:
                with open(tmp_path, "rb") as f:
                    kwargs: dict = dict(model=model, file=f, language="en")
                    if prompt:
                        # The line the actor is MEANT to say, as a vocabulary
                        # hint. This is what turns "a nita" into "Anita" and
                        # keeps period diction from being modernised.
                        kwargs["prompt"] = prompt[:224]
                    result = client.audio.transcriptions.create(**kwargs)
                text = (result.text or "").strip()
                break
            except Exception as exc:  # noqa: BLE001 - try the next model
                err = str(exc)
                # Bad or empty audio is not a model problem; no other model will
                # do better with it, and retrying wastes the actor's time.
                if "400" in err or "invalid_request_error" in err or "Invalid file format" in err:
                    raise
                last_error = exc
                logger.warning("transcription model %s failed, falling back: %s", model, err)
        else:
            if last_error is not None:
                raise last_error
        return {"text": text}
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
