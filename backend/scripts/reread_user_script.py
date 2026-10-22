"""Read an uploaded script's scenes again with scene_reader, and show what changes.

    cd backend && PYTHONPATH=. .venv/bin/python scripts/reread_user_script.py 132
    cd backend && PYTHONPATH=. .venv/bin/python scripts/reread_user_script.py 132 --dry-run
    cd backend && PYTHONPATH=. .venv/bin/python scripts/reread_user_script.py 132 --apply

A script uploaded before the model read every scene still has the rule
parser's lines: user script 132 has Mark's routine in Esther's mouth. This
takes the scenes already built, finds each one's text again in the script's
raw_text (the built text, cut on the same headings the upload cut it on),
has the reader read it, and prints the new lines as CHARACTER | text |
direction, with a diff against what is stored.

Dry run is the default and touches nothing; the read itself is a read-only
session. --apply replaces each scene's lines in one transaction: the old
lines' rehearsal deliveries go first (the same order reset_scene uses, for
the same foreign key), then the lines, then the new ones, and the scene's
original_snapshot takes the new lines and the reading so "Reset to original"
resets to the reading. A scene the reader flags is left exactly as it is.
Edits the actor made to a scene's lines are replaced too, which is why a
scene whose lines differ from its original snapshot is skipped unless
--include-edited is given.
"""

from __future__ import annotations

import argparse
import difflib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openai import OpenAI  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.actor import RehearsalLineDelivery, Scene, SceneLine, UserScript  # noqa: E402
from app.services import scene_reader  # noqa: E402
from app.services.scene_map import detect_scene_spans  # noqa: E402
from app.services.script_parser import (  # noqa: E402
    _preprocess_text,
    _strip_production_marks,
    whole_scenes,
)


def _row(line: dict) -> str:
    return f"{line.get('character')} | {line.get('text')} | {line.get('stage_direction') or ''}"


def _stored(scene: Scene) -> list:
    return [
        {"character": l.character_name, "text": l.text, "stage_direction": l.stage_direction}
        for l in sorted(scene.lines, key=lambda l: l.line_order)
    ]


def _edited(scene: Scene) -> bool:
    """Whether the actor changed the lines since the scene was built."""
    snap = (scene.original_snapshot or {}).get("lines")
    if snap is None:
        return False
    original = [(l.get("character_name"), l.get("text"), l.get("stage_direction")) for l in snap]
    now = [(l["character"], l["text"], l["stage_direction"]) for l in _stored(scene)]
    return original != now


def _overlap(a: list, b: list) -> float:
    ta = [l["text"] for l in a]
    tb = [l["text"] for l in b]
    return difflib.SequenceMatcher(a=ta, b=tb, autojunk=False).ratio()


def match_spans(scenes: list, rebuilt: list) -> dict:
    """Which rebuilt scene each stored scene came from: by its labels, else its lines."""
    out = {}
    for scene in scenes:
        same_label = [
            r for r in rebuilt
            if (r.get("act") or None) == (scene.act or None)
            and (r.get("scene_number") or None) == (scene.scene_number or None)
        ]
        pool = same_label or rebuilt
        if not pool:
            continue
        best = max(pool, key=lambda r: _overlap(_stored(scene), r["lines"]))
        if _overlap(_stored(scene), best["lines"]) >= 0.3 or same_label:
            out[scene.id] = best
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("script_id", type=int)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="the default: print, change nothing")
    mode.add_argument("--apply", action="store_true", help="replace the lines of scenes that read cleanly")
    parser.add_argument("--include-edited", action="store_true")
    parser.add_argument("--model", default=scene_reader.READER_MODEL)
    args = parser.parse_args()
    apply = bool(args.apply)

    db = SessionLocal()
    try:
        if not apply:
            db.connection(execution_options={"postgresql_readonly": True})
        script = db.get(UserScript, args.script_id)
        if script is None:
            sys.exit(f"No user script {args.script_id}")
        scenes = (
            db.query(Scene).filter(Scene.user_script_id == script.id).order_by(Scene.id).all()
        )
        print(f"Script {script.id} “{script.title}”: {len(scenes)} scene(s), "
              f"{'APPLY' if apply else 'dry run'}, model {args.model}\n")

        spans = detect_scene_spans(_preprocess_text(_strip_production_marks(script.raw_text or "")))
        rebuilt = whole_scenes(spans)
        matched = match_spans(scenes, rebuilt)

        todo = []
        for scene in scenes:
            if scene.id not in matched:
                print(f"Scene {scene.id} “{scene.title}”: its text was not found in raw_text, skipped")
                continue
            if _edited(scene) and not args.include_edited:
                print(f"Scene {scene.id} “{scene.title}”: the actor edited its lines, skipped "
                      "(--include-edited to re-read it anyway)")
                continue
            todo.append((scene, matched[scene.id]))

        client = OpenAI(api_key=settings.openai_api_key)
        rebuilt_scenes = [r for _, r in todo]
        scene_reader.read_scenes(rebuilt_scenes, client, model=args.model)

        changed = 0
        for scene, fresh in todo:
            reading = fresh.get("reading") or {}
            old = _stored(scene)
            new = fresh["lines"]
            print("=" * 78)
            print(f"Scene {scene.id} “{scene.title}” ({scene.act or ''} {scene.scene_number or ''})".rstrip())
            if reading.get("flagged"):
                print("FLAGGED, left as it is:")
                for p in reading.get("problems", []):
                    print(f"  - {p}")
                continue
            print(f"Read by {reading.get('model')} in {reading.get('attempts')} attempt(s). "
                  f"{len(old)} lines stored, {len(new)} read.\n")
            print("New lines:")
            for line in new:
                print("  " + _row(line))
            diff = list(difflib.unified_diff(
                [_row(l) for l in old], [_row(l) for l in new], "stored", "read", lineterm="", n=0
            ))
            print("\nDiff:" if diff else "\nNo change.")
            for d in diff:
                print("  " + d)
            if reading.get("characters"):
                print("\nCharacters:")
                for c in reading["characters"]:
                    print(f"  {c.get('name')}: {c.get('gender')}, {c.get('age_range') or 'age ?'}; "
                          f"{c.get('relationship')}; wants {c.get('wants')}; {c.get('temperament')}")
            if not diff:
                continue
            changed += 1
            if apply:
                _replace_lines(db, scene, new, reading, fresh)

        if apply:
            db.commit()
            print(f"\nApplied: {changed} scene(s) rewritten.")
        else:
            db.rollback()
            print(f"\nDry run: {changed} scene(s) would change. Nothing was written.")
    finally:
        db.close()


def _replace_lines(db, scene: Scene, lines: list, reading: dict, fresh: dict) -> None:
    from app.utils.duration import estimate_duration_seconds

    line_ids = [row[0] for row in db.query(SceneLine.id).filter(SceneLine.scene_id == scene.id)]
    if line_ids:
        db.query(RehearsalLineDelivery).filter(
            RehearsalLineDelivery.scene_line_id.in_(line_ids)
        ).delete(synchronize_session=False)
    db.query(SceneLine).filter(SceneLine.scene_id == scene.id).delete(synchronize_session=False)

    snapshot = []
    for idx, line in enumerate(lines):
        db.add(SceneLine(
            scene_id=scene.id,
            line_order=idx,
            character_name=line["character"],
            text=line["text"],
            stage_direction=line.get("stage_direction"),
            word_count=len(line["text"].split()),
        ))
        snapshot.append({
            "line_order": idx,
            "character_name": line["character"],
            "text": line["text"],
            "stage_direction": line.get("stage_direction"),
        })
    scene.line_count = len(lines)
    scene.estimated_duration_seconds = estimate_duration_seconds("\n".join(l["text"] for l in lines))
    scene.character_1_name = fresh.get("character_1") or scene.character_1_name
    scene.character_2_name = fresh.get("character_2") or scene.character_2_name
    scene.original_snapshot = {
        **(scene.original_snapshot or {}),
        "character_1_name": scene.character_1_name,
        "character_2_name": scene.character_2_name,
        "lines": snapshot,
        "reading": reading,
    }


if __name__ == "__main__":
    main()
