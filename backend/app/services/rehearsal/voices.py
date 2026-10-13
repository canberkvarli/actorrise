"""The short voice list (decision 3) and the default per character.

Scene already carries character_1_gender / character_2_gender from the
extractor; a third part has none and takes the next unused voice.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings
from app.services.rehearsal.contract import RehearsalLine, partner_characters, same_character


@dataclass(frozen=True)
class Voice:
    id: str
    label: str
    gender: str  # "female" | "male"
    vendor: str


_OPENAI = [
    Voice("coral", "Coral", "female", "openai"),
    Voice("ash", "Ash", "male", "openai"),
    Voice("sage", "Sage", "female", "openai"),
    Voice("echo", "Echo", "male", "openai"),
]
# Filled in after scripts/bench_tts.py; ids are ElevenLabs voice ids.
_ELEVENLABS = [
    Voice("21m00Tcm4TlvDq8ikWAM", "Rachel", "female", "elevenlabs"),
    Voice("TxGEqnHWrfWFTfGW9XjX", "Josh", "male", "elevenlabs"),
    Voice("EXAVITQu4vr4xnSDxMaL", "Bella", "female", "elevenlabs"),
    Voice("VR6AewLTigWG4xSOukaG", "Arnold", "male", "elevenlabs"),
]

VOICES: list[Voice] = _ELEVENLABS if settings.partner_tts_vendor == "elevenlabs" else _OPENAI


def voice_by_id(voice_id: str) -> Voice | None:
    return next((v for v in VOICES if v.id == voice_id), None)


def _gender_of(scene, name: str) -> str | None:
    if same_character(name, scene.character_1_name or ""):
        return (scene.character_1_gender or "").lower() or None
    if same_character(name, scene.character_2_name or ""):
        return (scene.character_2_gender or "").lower() or None
    return None


def default_voices(scene, lines: list[RehearsalLine], actor: str) -> dict[str, str]:
    """{partner character: voice id}. A known gender takes the first unused
    voice of that gender; unknown alternates. No two parts share a voice while
    the list lasts."""
    used: set[str] = set()
    out: dict[str, str] = {}
    toggle = ["female", "male"]
    for i, name in enumerate(partner_characters(lines, actor)):
        gender = _gender_of(scene, name)
        if gender not in ("female", "male"):
            gender = toggle[i % 2]
        pick = next((v for v in VOICES if v.gender == gender and v.id not in used), None) \
            or next((v for v in VOICES if v.id not in used), None) or VOICES[0]
        used.add(pick.id)
        out[name] = pick.id
    return out
