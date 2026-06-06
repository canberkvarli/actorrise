#!/usr/bin/env python3
"""
Purge the curated library scenes (Scene.is_library = true) and their dependents.

The monologue-study pivot removed the scene-library UI, so these rows are dead.
Safe + idempotent: deletes the scenes' dependent rows, the scenes, and ONLY the
plays that are now fully orphaned (no scenes AND no monologues) — so plays shared
with monologues are left untouched.

Usage:
    python scripts/purge_library_scenes.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    # Dependent rehearsal data for sessions on library scenes
    """DELETE FROM rehearsal_line_deliveries WHERE session_id IN
        (SELECT id FROM rehearsal_sessions WHERE scene_id IN
            (SELECT id FROM scenes WHERE is_library = true))""",
    "DELETE FROM rehearsal_sessions WHERE scene_id IN (SELECT id FROM scenes WHERE is_library = true)",
    "DELETE FROM scene_favorites WHERE scene_id IN (SELECT id FROM scenes WHERE is_library = true)",
    "DELETE FROM scene_lines WHERE scene_id IN (SELECT id FROM scenes WHERE is_library = true)",
    # Remember which plays the library scenes used (before deleting the scenes)
    "CREATE TEMP TABLE _lib_play_ids ON COMMIT DROP AS SELECT DISTINCT play_id FROM scenes WHERE is_library = true",
    "DELETE FROM scenes WHERE is_library = true",
    # Only drop plays that are now fully orphaned (no scenes, no monologues)
    """DELETE FROM plays p WHERE p.id IN (SELECT play_id FROM _lib_play_ids)
        AND NOT EXISTS (SELECT 1 FROM scenes s WHERE s.play_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM monologues m WHERE m.play_id = p.id)""",
]


def main():
    print("Purging curated library scenes (is_library = true)…")
    with engine.begin() as conn:
        before = conn.execute(text("SELECT count(*) FROM scenes WHERE is_library = true")).scalar()
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
        # `before` reflects pre-delete count; scenes are gone now.
    print(f"Done. Removed {before} library scene(s) and their dependents; orphaned plays cleaned up.")


if __name__ == "__main__":
    main()
