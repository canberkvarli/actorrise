"""Voice every partner line of the first scenes, in every voice the phone can
offer, so a stranger's first scene never waits on text-to-speech.

The three keyed scenes (and the one Late scene a server always had) are
warmed for both parts: whichever part the actor picks, the other part's lines
are in the bucket. The voices are the three the phone offers for a part: the
one the character reading casts, then the next two in the list, the same rule
app/demo.tsx uses. Lines already voiced are skipped by the cache itself.

Usage:
    cd backend && uv run python scripts/warm_first_scenes.py
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal  # noqa: E402
from app.services.guided_scene import guided_scene, guided_scenes  # noqa: E402
from app.services.rehearsal import partner_audio  # noqa: E402
from app.services.rehearsal.contract import lines_for, same_character  # noqa: E402
from app.services.rehearsal.delivery import LineVoice, scene_voicing  # noqa: E402
from app.services.rehearsal.voices import VOICES, default_voices  # noqa: E402

OFFERED = 3  # voices per part on the phone


def main() -> None:
    db = SessionLocal()
    try:
        scenes = [scene for _, scene, _ in guided_scenes(db)]
        late = guided_scene(db)
        if late is not None and all(s.id != late.id for s in scenes):
            scenes.append(late)
        if not scenes:
            print("Nothing seeded: run seed_sample_script.py first.")
            return
        total = 0
        for scene in scenes:
            lines = lines_for(db, scene.id)
            voicing = scene_voicing(db, scene, lines)
            capped = partner_audio.over_cap(db)
            parts: list[str] = []
            for line in lines:
                if not any(same_character(line.character, p) for p in parts):
                    parts.append(line.character)
            for actor in parts:
                cast = default_voices(scene, lines, actor, voicing.characters)
                keys: list[str] = []
                line_for: dict[str, LineVoice] = {}
                for line in lines:
                    if same_character(line.character, actor):
                        continue
                    first = next((v for c, v in cast.items() if same_character(c, line.character)), None) or VOICES[0].id
                    offered = [first, *[v.id for v in VOICES if v.id != first]][:OFFERED]
                    spec = voicing.line_voice(line)
                    for voice in offered:
                        key = partner_audio.ensure_for(db, voice, spec, capped)
                        if key in line_for:
                            continue
                        keys.append(key)
                        line_for[key] = spec
                db.commit()
                partner_audio.synthesise_pending(db, keys, line_for)
                total += len(keys)
                print(f"scene {scene.id} {scene.title!r}, {actor} speaking: {len(keys)} partner lines in {OFFERED} voices")
        print(f"done: {total} clips made sure of")
    finally:
        db.close()


if __name__ == "__main__":
    main()
