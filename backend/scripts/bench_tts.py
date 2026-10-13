#!/usr/bin/env python
"""Four lines through both vendors, into outputs/bench_tts/, for Canberk to hear.

Usage:
    cd backend && OPENAI_API_KEY=... ELEVENLABS_API_KEY=... uv run python scripts/bench_tts.py

Prices to check by hand before deciding (October 2026):
  gpt-4o-mini-tts  https://openai.com/api/pricing       (per 1M chars)
  ElevenLabs v3    https://elevenlabs.io/pricing         (per 1k chars, plan-dependent)
Print the per-line character counts so the per-scene cost can be worked out.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.rehearsal.synth import synthesize  # noqa: E402

LINES = [
    ("short", "Get out.", None),
    ("name", "Anita, I told you twice. The Fergusons are not coming.", None),
    ("directed", "I never wanted any of this.", "whispering"),
    ("long", " ".join([
        "You think I don't know what you did? I was there. I stood in that hallway",
        "for an hour listening to you lie to her, and every word of it was a word",
        "you had already said to me, in this kitchen, the night we buried him.",
        "You don't get to come here and ask me to be kind. Kindness is what I had",
        "before you taught me what it costs. So no. I won't sit down. I won't lower",
        "my voice. I will stand here until you say it, out loud, in front of me,",
        "the way you should have said it twenty years ago, and then I will leave",
        "and you will never see me again. Say it. Say what you did. Say it now.",
    ]), None),
]

VOICES = {"openai": "coral", "elevenlabs": "Rachel"}

out = backend_dir.parent / "outputs" / "bench_tts"
out.mkdir(parents=True, exist_ok=True)

for vendor, voice in VOICES.items():
    for name, text, direction in LINES:
        t0 = time.perf_counter()
        try:
            audio = synthesize(vendor, voice, text, direction)
        except Exception as exc:  # noqa: BLE001
            print(f"{vendor:10} {name:9} FAILED {exc}")
            continue
        dt = time.perf_counter() - t0
        path = out / f"{vendor}-{name}.mp3"
        path.write_bytes(audio)
        print(f"{vendor:10} {name:9} {len(text):4d} chars  {dt:5.2f}s  {len(audio):7d} bytes  {path.name}")
