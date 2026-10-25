#!/usr/bin/env python
"""Synthesise every partner line of every library scene for its default voices,
so the first actor to open any library scene pays nothing.

Each scene is warmed for both parts: whichever character the actor picks, the
other one's lines are already in the bucket. Lines already synthesised are
skipped by the cache itself (one row per vendor, model, voice, notes, text).
A scene with no acting notes gets them first (services/rehearsal/delivery),
the same one call the first actor to open it would have paid for. The cap
applies here too: past it, the warm-up is voiced by Inworld.

Usage:
    cd backend && uv run python scripts/warm_partner_audio.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal  # noqa: E402
from app.models.actor import Scene  # noqa: E402
from app.services.rehearsal import partner_audio  # noqa: E402
from app.services.rehearsal.contract import lines_for, same_character  # noqa: E402
from app.services.rehearsal.delivery import LineVoice, scene_voicing  # noqa: E402
from app.services.rehearsal.voices import default_voices  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=None, help="stop after this many scenes")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        scenes = db.query(Scene).filter(Scene.is_library == True).order_by(Scene.id)  # noqa: E712
        if args.limit:
            scenes = scenes.limit(args.limit)
        total = 0
        for scene in scenes:
            lines = lines_for(db, scene.id)
            voicing = scene_voicing(db, scene, lines)
            capped = partner_audio.over_cap(db)
            for actor in (scene.character_1_name, scene.character_2_name):
                if not actor:
                    continue
                voices = default_voices(scene, lines, actor, voicing.characters)
                keys: list[str] = []
                line_for: dict[str, LineVoice] = {}
                for line in lines:
                    if same_character(line.character, actor):
                        continue
                    voice = next((v for c, v in voices.items() if same_character(c, line.character)), None)
                    if not voice:
                        continue
                    spec = voicing.line_voice(line)
                    key = partner_audio.ensure_for(db, voice, spec, capped)
                    if key in line_for:
                        continue
                    keys.append(key)
                    line_for[key] = spec
                db.commit()
                partner_audio.synthesise_pending(db, keys, line_for)
                total += len(keys)
            print(f"scene {scene.id} {scene.title!r}: done ({total} lines so far)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
