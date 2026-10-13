"""One function, two vendors. Quality per line is what is being bought; latency
is not, because every line is synthesised ahead of time and cached."""
from __future__ import annotations

import re

import httpx

from app.core.config import settings


def _clean_direction(direction: str | None) -> str:
    if not direction:
        return ""
    return re.sub(r"^[\[\(]|[\]\)]$", "", direction.strip()).strip()


def _openai_tts():
    from app.services.tts_service import TTSService
    return TTSService()


def _openai(voice: str, text: str, direction: str | None) -> bytes:
    d = _clean_direction(direction)
    instructions = f"Deliver this line {d}." if d else ""
    return _openai_tts().synthesize_speech(text, voice=voice, instructions=instructions, response_format="mp3")


def _elevenlabs(voice: str, text: str, direction: str | None) -> bytes:
    if not settings.elevenlabs_api_key:
        raise ValueError("ELEVENLABS_API_KEY is not set")
    d = _clean_direction(direction)
    spoken = f"[{d}] {text}" if d else text
    res = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        params={"output_format": "mp3_44100_64"},
        headers={"xi-api-key": settings.elevenlabs_api_key},
        json={"text": spoken, "model_id": "eleven_v3"},
        timeout=60,
    )
    if res.status_code != 200:
        raise RuntimeError(f"ElevenLabs {res.status_code}: {res.text[:200]}")
    return res.content


def synthesize(vendor: str, voice: str, text: str, direction: str | None) -> bytes:
    if vendor == "openai":
        return _openai(voice, text, direction)
    if vendor == "elevenlabs":
        return _elevenlabs(voice, text, direction)
    raise ValueError(f"unknown TTS vendor {vendor!r}")
