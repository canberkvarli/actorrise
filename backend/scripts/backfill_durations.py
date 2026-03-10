#!/usr/bin/env python
"""
Recalculate estimated_duration_seconds for all monologues and scenes
using the new performance-paced heuristic (130 WPM + punctuation pauses).

Usage:
    uv run python scripts/backfill_durations.py
    uv run python scripts/backfill_durations.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Scene, SceneLine
from app.utils.duration import estimate_duration_seconds


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show changes without saving")
    args = parser.parse_args()

    db = SessionLocal()

    # Monologues
    monologues = db.query(Monologue).all()
    mono_updated = 0
    for m in monologues:
        if not m.text:
            continue
        new_duration = estimate_duration_seconds(m.text)
        old_duration = m.estimated_duration_seconds or 0
        if new_duration != old_duration:
            if args.dry_run:
                print(f"  Monologue #{m.id} '{m.title[:40]}': {old_duration}s -> {new_duration}s")
            else:
                m.estimated_duration_seconds = new_duration
            mono_updated += 1

    # Scenes
    scenes = db.query(Scene).all()
    scene_updated = 0
    for s in scenes:
        lines = db.query(SceneLine).filter_by(scene_id=s.id).order_by(SceneLine.line_order).all()
        if not lines:
            continue
        all_text = "\n".join(l.text for l in lines if l.text)
        new_duration = estimate_duration_seconds(all_text)
        old_duration = s.estimated_duration_seconds or 0
        if new_duration != old_duration:
            if args.dry_run:
                print(f"  Scene #{s.id} '{s.title[:40]}': {old_duration}s -> {new_duration}s")
            else:
                s.estimated_duration_seconds = new_duration
            scene_updated += 1

    if args.dry_run:
        print(f"\nDry run: {mono_updated} monologues, {scene_updated} scenes would be updated")
    else:
        db.commit()
        print(f"Updated {mono_updated}/{len(monologues)} monologues, {scene_updated}/{len(scenes)} scenes")

    db.close()


if __name__ == "__main__":
    main()
