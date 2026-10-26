"""One function, four vendors. Quality per line is what is being bought;
latency is not, because every line is synthesised ahead of time and cached.

Gemini is the partner since 2026-10-23: Canberk listened to every vendor and
it won by ear. It is sent the line, verbatim, with its direction as a style
(services/rehearsal/delivery.gemini_style), answers with raw 24 kHz 16-bit
mono PCM, and is billed per audio token, about
25 a second. So the PCM is trimmed of the digital silence Gemini has been
seen to pad either end with (it is paid for and it is dead air before the
partner's cue) and encoded to MP3, because as WAV a line is about ten times
the size and the partner-lines bucket is on a tight quota.

Inworld is the stand-in past the monthly cap (partner_audio.vendor_for).
OpenAI and ElevenLabs stay for a deploy without a Gemini key.
"""
from __future__ import annotations

import array
import base64
import json
import collections
import os
import re
import sys
import threading
import time

import httpx
import jwt

from app.core.config import settings
from app.services.rehearsal.delivery import LineVoice, gemini_style, tagged_text

GEMINI_RATE = 24_000  # Hz, mono, signed 16-bit little-endian
INWORLD_MODEL = "inworld-tts-2"
OPENAI_MODEL = "gpt-4o-mini-tts"
# A sample this quiet or quieter is silence. 16-bit full scale is 32767; 200
# is -44 dBFS, below a breath and well above the dither of a "silent" pad.
SILENCE_FLOOR = 200
# Kept either side of the voice, so a consonant's attack and a trailing
# breath are not clipped. Under a tenth of a second does not read as a gap.
EDGE_PAD_SECONDS = 0.06
RETRY_SECONDS = 2.0

# Gemini TTS allows 10 requests a minute on the account's tier (the 429 says
# so: "limit: 10 requests per minute on Tier 1"). A scene asks for all its
# partner lines at once, so on 2026-10-23 the eleventh line of every fresh
# scene failed and the run went silent after the actor's line. Calls now
# queue for a slot, one under the limit, across the whole process.
GEMINI_RPM = int(os.getenv("GEMINI_TTS_RPM", "9"))
GEMINI_ATTEMPTS = 4
_slots: collections.deque = collections.deque()
_slot_lock = threading.Lock()


def _wait_for_gemini_slot() -> None:
    while True:
        with _slot_lock:
            now = time.monotonic()
            while _slots and now - _slots[0] >= 60:
                _slots.popleft()
            if len(_slots) < GEMINI_RPM:
                _slots.append(now)
                return
            wait = 60 - (now - _slots[0]) + 0.05
        time.sleep(wait)


def _retry_after(text: str) -> float:
    """Seconds Gemini asks us to wait ("Please retry in 48s"), within reason."""
    m = re.search(r"retry in ([0-9.]+)s", text or "")
    return min(float(m.group(1)) + 1, 65.0) if m else 20.0


def model_for(vendor: str) -> str:
    """The model a vendor speaks with. Part of every cache key."""
    return {
        "gemini": settings.partner_tts_model,
        "inworld": INWORLD_MODEL,
        "openai": OPENAI_MODEL,
        "vertex": settings.vertex_tts_model,
        "elevenlabs": "eleven_v3",
    }.get(vendor, "")


# ── audio ────────────────────────────────────────────────────────────────────

def _samples(pcm: bytes) -> array.array:
    a = array.array("h")
    a.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    if sys.byteorder != "little":
        a.byteswap()
    return a


def trim_silence(pcm: bytes, rate: int = GEMINI_RATE, floor: int = SILENCE_FLOOR,
                 pad_seconds: float = EDGE_PAD_SECONDS) -> bytes:
    """16-bit mono PCM without the silence at either end, keeping `pad_seconds`
    of it. All silence (or nothing) comes back empty: there is no line in it."""
    a = _samples(pcm)
    n = len(a)
    start = next((i for i in range(n) if abs(a[i]) > floor), None)
    if start is None:
        return b""
    end = next(i for i in range(n - 1, -1, -1) if abs(a[i]) > floor)
    pad = int(rate * pad_seconds)
    lo, hi = max(0, start - pad), min(n, end + 1 + pad)
    out = a[lo:hi]
    if sys.byteorder != "little":
        out.byteswap()
    return out.tobytes()


def pcm_to_mp3(pcm: bytes, rate: int = GEMINI_RATE, kbps: int = 64) -> bytes:
    """Mono MP3. 64 kbit/s is plenty for one voice and about a tenth of the
    PCM (384 kbit/s at 24 kHz)."""
    import lameenc

    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)  # 2 is near-best; the encode is milliseconds either way
    return bytes(enc.encode(pcm) + enc.flush())


# ── vendors ──────────────────────────────────────────────────────────────────

def _gemini_pcm(voice: str, line: LineVoice) -> bytes:
    """Raw PCM for one line, through the Interactions API.

    Gemini 3.8 TTS reads its text field as a verbatim transcript: the prose
    prompt in the original sample ("You are Mark, ... Say the line ...")
    was spoken aloud, all twenty seconds of it, on 2026-10-23. Direction
    goes in the turn's speech_metadata.style instead, and the text is the
    line and nothing else. audio/l16 asks for headerless PCM; the unary
    default is a WAV whose RIFF header would otherwise be read as samples.
    """
    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set")
    content: dict = {"type": "text", "text": line.text.strip()}
    style = gemini_style(line)
    if style:
        content["annotations"] = [{"type": "speech_metadata", "style": style}]
    body = {
        "model": settings.partner_tts_model,
        "input": [{"type": "user_input", "content": [content]}],
        "response_format": {"type": "audio", "mime_type": "audio/l16"},
        "generation_config": {"speech_config": [{"voice": voice}]},
    }
    # Every call waits for a slot under the per-minute limit. A 429 anyway
    # (another process, a lower quota than we think) waits as long as Gemini
    # says and tries again; a 5xx waits a moment. Only a line that fails every
    # attempt becomes a failed row, retried later by partner_audio's own clock.
    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        _wait_for_gemini_slot()
        res = httpx.post(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            headers={"x-goog-api-key": settings.gemini_api_key},
            json=body,
            timeout=90,
        )
        # A per-DAY limit ("limit: 100 requests per day", "retry in 16h…") will
        # not lift in a minute; waiting it out held the one voicing worker for
        # minutes per line while every other line queued behind it.
        if attempt < GEMINI_ATTEMPTS and res.status_code == 429 and "per day" not in res.text:
            time.sleep(_retry_after(res.text))
            continue
        if attempt < GEMINI_ATTEMPTS and res.status_code >= 500:
            time.sleep(RETRY_SECONDS)
            continue
        break
    if res.status_code != 200:
        raise RuntimeError(f"Gemini {res.status_code}: {res.text[:200]}")
    try:
        audio = [
            c for step in res.json().get("steps") or [] if step.get("type") == "model_output"
            for c in step.get("content") or [] if c.get("type") == "audio"
        ][-1]
    except (IndexError, AttributeError, TypeError, ValueError):
        raise RuntimeError(f"Gemini returned no audio: {res.text[:200]}")
    rate = audio.get("sample_rate") or GEMINI_RATE
    if int(rate) != GEMINI_RATE or "l16" not in (audio.get("mime_type") or "audio/l16"):
        raise RuntimeError(f"Gemini audio is {audio.get('mime_type')} at {rate} Hz, expected L16 at {GEMINI_RATE}")
    return base64.b64decode(audio["data"])


def _gemini(voice: str, line: LineVoice) -> bytes:
    pcm = trim_silence(_gemini_pcm(voice, line))
    if not pcm:
        raise RuntimeError("Gemini returned silence")
    return pcm_to_mp3(pcm)


VERTEX_LOCATION = "global"  # the only region the voice models are published in
VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform"
_vertex_tok: tuple[str, float] | None = None
_vertex_tok_lock = threading.Lock()


def _vertex_token() -> str:
    """An access token for Vertex, minted from the service account with a
    signed JWT and kept until it is near its hour."""
    global _vertex_tok
    with _vertex_tok_lock:
        if _vertex_tok and _vertex_tok[1] - time.time() > 120:
            return _vertex_tok[0]
        raw = settings.vertex_service_account_json
        if not raw:
            raise ValueError("VERTEX_SERVICE_ACCOUNT_JSON is not set")
        sa = json.loads(raw)
        now = int(time.time())
        assertion = jwt.encode(
            {"iss": sa["client_email"], "scope": VERTEX_SCOPE, "aud": sa["token_uri"], "iat": now, "exp": now + 3600},
            sa["private_key"], algorithm="RS256",
        )
        res = httpx.post(sa["token_uri"], data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}, timeout=30)
        if res.status_code != 200:
            raise RuntimeError(f"Vertex token {res.status_code}: {res.text[:200]}")
        body = res.json()
        _vertex_tok = (body["access_token"], time.time() + int(body.get("expires_in", 3600)))
        return _vertex_tok[0]


def _vertex_pcm(voice: str, line: LineVoice) -> bytes:
    """Raw PCM for one line from the same voices through Vertex AI.

    Gemini 2.5 TTS takes how a line is said as a prefix it follows and does
    not speak ("Say it quietly, hurt: ..."), checked by transcribing the
    result on 2026-10-26; the 3.8 model is on Vertex too but speaks any
    prefix aloud and has no other channel for a note there. L16 at 24 kHz
    is what it answers with, the same as the Interactions API.
    """
    if not settings.vertex_project:
        raise ValueError("VERTEX_PROJECT is not set")
    text = line.text.strip()
    style = gemini_style(line)
    prompt = f"Say it {style}: {text}" if style else text
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    url = (f"https://aiplatform.googleapis.com/v1/projects/{settings.vertex_project}/locations/{VERTEX_LOCATION}"
           f"/publishers/google/models/{settings.vertex_tts_model}:generateContent")
    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        res = httpx.post(url, headers={"Authorization": f"Bearer {_vertex_token()}"}, json=body, timeout=90)
        if attempt < GEMINI_ATTEMPTS and res.status_code in (429, 500, 503):
            time.sleep(RETRY_SECONDS * attempt)
            continue
        break
    if res.status_code != 200:
        raise RuntimeError(f"Vertex {res.status_code}: {res.text[:200]}")
    try:
        parts = res.json()["candidates"][0]["content"]["parts"]
        inline = next(p["inlineData"] for p in parts if "inlineData" in p)
    except (KeyError, IndexError, StopIteration, TypeError, ValueError):
        raise RuntimeError(f"Vertex returned no audio: {res.text[:200]}")
    mime = inline.get("mimeType") or ""
    if "l16" not in mime.lower() or f"rate={GEMINI_RATE}" not in mime:
        raise RuntimeError(f"Vertex audio is {mime}, expected L16 at {GEMINI_RATE}")
    return base64.b64decode(inline["data"])


def _vertex(voice: str, line: LineVoice) -> bytes:
    pcm = trim_silence(_vertex_pcm(voice, line))
    if not pcm:
        raise RuntimeError("Vertex returned silence")
    return pcm_to_mp3(pcm)


def _inworld(voice: str, line: LineVoice) -> bytes:
    """`voice` is the Gemini voice the part was cast with; Inworld reads it
    with that voice's stand-in (voices.Voice.stand_in)."""
    from app.services.rehearsal.voices import _GEMINI

    if not settings.inworld_api_key:
        raise ValueError("INWORLD_API_KEY is not set")
    match = next((v for v in _GEMINI if v.id == voice), None)
    stand_in = match.stand_in if match else voice
    res = httpx.post(
        "https://api.inworld.ai/tts/v1/voice",
        headers={"Authorization": f"Basic {settings.inworld_api_key}"},
        json={
            "text": tagged_text(line),
            "voiceId": stand_in,
            "modelId": INWORLD_MODEL,
            "audioConfig": {"audioEncoding": "MP3"},
        },
        timeout=60,
    )
    if res.status_code != 200:
        raise RuntimeError(f"Inworld {res.status_code}: {res.text[:200]}")
    try:
        return base64.b64decode(res.json()["audioContent"])
    except (KeyError, TypeError, ValueError):
        raise RuntimeError(f"Inworld returned no audio: {res.text[:200]}")


def _clean_direction(direction: str | None) -> str:
    if not direction:
        return ""
    return re.sub(r"^[\[\(]|[\]\)]$", "", direction.strip()).strip()


def _openai_tts():
    from app.services.tts_service import TTSService
    return TTSService()


def _openai(voice: str, line: LineVoice) -> bytes:
    d = ", ".join(x for x in (_clean_direction(line.acting), _clean_direction(line.delivery)) if x)
    instructions = f"Deliver this line {d}." if d else ""
    return _openai_tts().synthesize_speech(line.text, voice=voice, instructions=instructions, response_format="mp3")


def _elevenlabs(voice: str, line: LineVoice) -> bytes:
    if not settings.elevenlabs_api_key:
        raise ValueError("ELEVENLABS_API_KEY is not set")
    res = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        params={"output_format": "mp3_44100_64"},
        headers={"xi-api-key": settings.elevenlabs_api_key},
        json={"text": tagged_text(line), "model_id": "eleven_v3"},
        timeout=60,
    )
    if res.status_code != 200:
        raise RuntimeError(f"ElevenLabs {res.status_code}: {res.text[:200]}")
    return res.content


def synthesize(vendor: str, voice: str, line: LineVoice) -> bytes:
    """MP3 bytes for one line."""
    if vendor == "gemini":
        return _gemini(voice, line)
    if vendor == "inworld":
        return _inworld(voice, line)
    if vendor == "openai":
        return _openai(voice, line)
    if vendor == "vertex":
        return _vertex(voice, line)
    if vendor == "elevenlabs":
        return _elevenlabs(voice, line)
    raise ValueError(f"unknown TTS vendor {vendor!r}")
