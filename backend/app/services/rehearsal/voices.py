"""The voice list and the default per character.

Gemini's ten (2026-10-23) replace OpenAI's four. Gender is not guessed from
the names: it is what Google's own voice library says
(GET /v1beta/voices, the `gender` field, which agrees with the Chirp 3 HD
table), and Pulcherrima, which the library calls neutral, is left out so a
part read as a woman or a man always gets one. Five women and five men, from
the youngest-sounding (Leda, Fenrir) to the oldest (Gacrux, Algenib). The age
in each label is a reading of the library's description ("Youthful",
"Mature", "Gravelly") and the pitch, not a figure Google publishes.

The default for each partner is chosen from the scene reader's character
reading (gender, age, temperament) when there is one, so a gruff father is not
read by the bright young voice because it happened to be next in the list.
Without a reading it falls back to the extractor's character_1_gender /
character_2_gender, and then to alternating.

Each Gemini voice names the Inworld voice that stands in for it once the
monthly cap is reached (partner_audio.vendor_for), chosen to be the nearest
in gender, age and colour in Inworld's own catalogue, and the OpenAI voice that
stands in once the day's Gemini requests are spent (partner_audio.scene_vendor).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.config import settings
from app.services.rehearsal.contract import RehearsalLine, partner_characters, same_character


@dataclass(frozen=True)
class Voice:
    id: str
    label: str
    gender: str  # "female" | "male"
    vendor: str
    # A rough age, in decades: 2 is a voice that reads as twenties, 5 as fifty
    # and over. Only ever compared with a character's age_range.
    age: int = 3
    # Words a character's temperament may share with this voice.
    traits: tuple[str, ...] = field(default_factory=tuple)
    # The Inworld voice that reads this part past the monthly cap.
    stand_in: str = ""
    # The OpenAI voice that reads it once Gemini's day is spent.
    day_stand_in: str = ""


_GEMINI = [
    Voice("Leda", "Leda · youthful, bright, 20s", "female", "gemini", 2,
          ("young", "bright", "eager", "energetic", "excited", "playful", "naive", "lively", "bubbly"), "Zoe", "nova"),
    Voice("Aoede", "Aoede · breezy, easy, 30s", "female", "gemini", 3,
          ("relaxed", "light", "breezy", "casual", "easygoing", "wry", "charming", "flirtatious"), "Ashley", "coral"),
    Voice("Sulafat", "Sulafat · warm, kind, 30s", "female", "gemini", 3,
          ("warm", "kind", "gentle", "caring", "tender", "patient", "loving", "soft"), "Naomi", "shimmer"),
    Voice("Kore", "Kore · firm, direct, 40s", "female", "gemini", 4,
          ("firm", "direct", "blunt", "guarded", "tough", "sharp", "impatient", "angry", "cold", "stern", "serious"), "Lauren", "sage"),
    Voice("Gacrux", "Gacrux · mature, assured, 50s+", "female", "gemini", 5,
          ("mature", "authoritative", "dry", "weary", "wise", "commanding", "grand", "formal"), "Deborah", "alloy"),
    Voice("Fenrir", "Fenrir · eager, excitable, 20s", "male", "gemini", 2,
          ("young", "excitable", "eager", "nervous", "restless", "energetic", "passionate", "impulsive", "anxious"), "Bryce", "verse"),
    Voice("Puck", "Puck · upbeat, playful, 30s", "male", "gemini", 3,
          ("upbeat", "playful", "joking", "funny", "cheerful", "charming", "witty", "teasing", "comic"), "James", "fable"),
    Voice("Achird", "Achird · friendly, warm, 30s", "male", "gemini", 3,
          ("friendly", "warm", "kind", "gentle", "sincere", "earnest", "tender", "loving", "shy"), "Evan", "ash"),
    Voice("Charon", "Charon · steady, low, 40s", "male", "gemini", 4,
          ("steady", "calm", "measured", "serious", "controlled", "reserved", "guarded", "cold", "stern"), "Dennis", "echo"),
    Voice("Algenib", "Algenib · gravelly, weathered, 50s+", "male", "gemini", 5,
          ("gravelly", "gruff", "weary", "bitter", "old", "hard", "menacing", "commanding", "tired"), "Theodore", "onyx"),
]

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

_BY_VENDOR = {"gemini": _GEMINI, "openai": _OPENAI, "elevenlabs": _ELEVENLABS}
VOICES: list[Voice] = _BY_VENDOR.get(settings.partner_tts_vendor, _OPENAI)


def voice_by_id(voice_id: str) -> Voice | None:
    return next((v for v in VOICES if v.id == voice_id), None)


def _gender_of(scene, name: str) -> str | None:
    if same_character(name, scene.character_1_name or ""):
        return (scene.character_1_gender or "").lower() or None
    if same_character(name, scene.character_2_name or ""):
        return (scene.character_2_gender or "").lower() or None
    return None


def reading_for(characters: list[dict] | None, name: str) -> dict | None:
    """The reader's entry for one character, matched the way cues are."""
    return next((c for c in characters or () if same_character(c.get("name") or "", name)), None)


_DECADE = re.compile(r"(\d{1,2})0s|(\d{2})")


def age_decade(age_range: str | None) -> int | None:
    """"40s" -> 4, "late 30s" -> 3, "teens" -> 1, "elderly" -> 6. None when
    the reading says nothing usable."""
    s = (age_range or "").lower()
    if not s:
        return None
    m = _DECADE.search(s)
    if m:
        n = int(m.group(1) or m.group(2)[0])
        return max(1, min(n, 7))
    if any(w in s for w in ("teen", "child", "kid", "boy", "girl", "adolescent")):
        return 1
    if any(w in s for w in ("young", "twenties", "student")):
        return 2
    if "middle" in s:
        return 4
    if any(w in s for w in ("old", "elder", "senior", "aged")):
        return 6
    return None


def _score(voice: Voice, gender: str | None, age: int | None, temperament: str) -> float:
    """How well a voice fits a reading. Gender decides first (a wrong-gender
    voice only wins when no right one is left), then age, then the
    temperament words the two share."""
    score = 0.0
    if gender in ("female", "male"):
        score += 100 if voice.gender == gender else 0
    if age is not None:
        score += 10 - 4 * abs(min(age, 5) - voice.age)
    words = set(re.findall(r"[a-z]+", temperament.lower()))
    score += 3 * len(words & set(voice.traits))
    return score


def default_voices(scene, lines: list[RehearsalLine], actor: str,
                   characters: list[dict] | None = None) -> dict[str, str]:
    """{partner character: voice id}. No two parts share a voice while the
    list lasts.

    With the reader's `characters` (the scene's reading), each partner takes
    the unused voice that best fits their gender, age and temperament, in
    order of appearance. Without it, a known gender (the reading's, else the
    extractor's) takes the first unused voice of that gender; an unknown one
    alternates. The order of the list is the tie-break either way, so a scene
    always opens on the same voices.
    """
    used: set[str] = set()
    out: dict[str, str] = {}
    toggle = ["female", "male"]
    for i, name in enumerate(partner_characters(lines, actor)):
        reading = reading_for(characters, name) or {}
        gender = (reading.get("gender") or "").lower() or _gender_of(scene, name)
        age = age_decade(reading.get("age_range"))
        temperament = " ".join(str(reading.get(k) or "") for k in ("temperament", "relationship"))
        free = [v for v in VOICES if v.id not in used]
        if not free:
            pick = VOICES[i % len(VOICES)]
        elif reading:
            if gender not in ("female", "male"):
                gender = None
            # max() keeps the first of equals, so the list order breaks ties.
            pick = max(free, key=lambda v: _score(v, gender, age, temperament))
        else:
            if gender not in ("female", "male"):
                gender = toggle[i % 2]
            pick = next((v for v in free if v.gender == gender), None) or free[0]
        used.add(pick.id)
        out[name] = pick.id
    return out
