#!/usr/bin/env python
"""Make the ▶ sample for every partner voice: a few seconds each, one MP3 per
voice in public/voices/<id>.mp3, shipped with the site.

Made once and committed, not synthesised on demand: a sample is the same for
every actor, and a static file costs nothing to play and nothing to keep.
Every voice reads the same line, so the run setup compares voices, not lines.
Run it again only when the voice list (services/rehearsal/voices._GEMINI) or
the model changes. Costs well under a cent.

Usage:
    cd backend && uv run python scripts/make_voice_samples.py [--only Puck,Kore]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.rehearsal.delivery import LineVoice  # noqa: E402
from app.services.rehearsal.synth import synthesize  # noqa: E402
from app.services.rehearsal.voices import _GEMINI  # noqa: E402

# About three seconds, a line a scene partner could say, with a turn in it.
SAMPLE = LineVoice(text="You came. Sit down, I'll read with you.",
                   acting="warm, a little surprised")
OUT = backend_dir.parent / "public" / "voices"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated voice ids")
    args = ap.parse_args()
    only = {v.strip() for v in args.only.split(",") if v.strip()}
    OUT.mkdir(parents=True, exist_ok=True)
    for voice in _GEMINI:
        if only and voice.id not in only:
            continue
        mp3 = synthesize("gemini", voice.id, SAMPLE)
        path = OUT / f"{voice.id.lower()}.mp3"
        path.write_bytes(mp3)
        print(f"{voice.label:40} {len(mp3):6d} bytes  {path.relative_to(backend_dir.parent)}")


if __name__ == "__main__":
    main()
