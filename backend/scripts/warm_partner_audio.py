#!/usr/bin/env python
"""Synthesise every partner line of every library scene for its default voices,
so the first actor to open any library scene pays nothing.

Each scene is warmed for both parts: whichever character the actor picks, the
other one's lines are already in the bucket. Lines already synthesised are
skipped by the cache itself (one row per vendor, voice, direction, text).

Usage:
    cd backend && uv run python scripts/warm_partner_audio.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.actor import Scene  # noqa: E402
from app.services.rehearsal import partner_audio  # noqa: E402
from app.services.rehearsal.contract import lines_for, same_character  # noqa: E402
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
            for actor in (scene.character_1_name, scene.character_2_name):
                if not actor:
                    continue
                voices = default_voices(scene, lines, actor)
                keys: list[str] = []
                text_for: dict[str, tuple[str, str | None]] = {}
                for line in lines:
                    if same_character(line.character, actor):
                        continue
                    voice = next((v for c, v in voices.items() if same_character(c, line.character)), None)
                    if not voice:
                        continue
                    key = partner_audio.ensure(db, settings.partner_tts_vendor, voice, line.direction, line.text)
                    if key in text_for:
                        continue
                    keys.append(key)
                    text_for[key] = (line.text, line.direction)
                db.commit()
                partner_audio.synthesise_pending(db, keys, text_for)
                total += len(keys)
            print(f"scene {scene.id} {scene.title!r}: done ({total} lines so far)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
