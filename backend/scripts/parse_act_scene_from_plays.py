"""
Parse act/scene information from play full_text and update monologues.

This script:
1. Finds plays with full_text (public domain classical works)
2. Parses ACT/SCENE structure from the text
3. Matches each monologue's text to its location in the play
4. Updates act and scene fields

Usage (from backend directory):
    uv run python scripts/parse_act_scene_from_plays.py

Requirements:
    - Run add_act_scene_columns.py first
    - Database connection via app config (DATABASE_URL).
"""

import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play


def roman_to_int(roman: str) -> int:
    """Convert Roman numeral to integer."""
    roman = roman.upper()
    values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
    result = 0
    prev = 0
    for char in reversed(roman):
        curr = values.get(char, 0)
        if curr < prev:
            result -= curr
        else:
            result += curr
        prev = curr
    return result


def find_act_scene_at_position(full_text: str, position: int) -> tuple[int | None, int | None]:
    """
    Find the act and scene number at a given position in the text.
    Looks backwards from position to find the most recent ACT and SCENE markers.
    """
    before = full_text[:position]

    # Find last ACT marker (ACT I, ACT II, etc.)
    act_matches = list(re.finditer(r'\bACT\s+([IVX]+)\b', before, re.IGNORECASE))
    act = None
    if act_matches:
        last_act = act_matches[-1]
        act = roman_to_int(last_act.group(1))

    # Find last SCENE marker (SCENE I, SCENE II, etc.)
    scene_matches = list(re.finditer(r'\bSCENE\s+([IVX]+)\b', before, re.IGNORECASE))
    scene = None
    if scene_matches:
        last_scene = scene_matches[-1]
        scene = roman_to_int(last_scene.group(1))

    return act, scene


def find_monologue_position(full_text: str, monologue_text: str) -> int | None:
    """
    Find where a monologue appears in the full play text.
    Uses the first ~100 chars of the monologue for matching.
    """
    # Clean up text for comparison
    full_lower = full_text.lower()

    # Try first 100 chars of monologue
    search_text = monologue_text[:100].lower().strip()

    # Try exact match first
    pos = full_lower.find(search_text)
    if pos >= 0:
        return pos

    # Try with some normalization (remove extra whitespace)
    search_normalized = re.sub(r'\s+', ' ', search_text)
    full_normalized = re.sub(r'\s+', ' ', full_lower)
    pos = full_normalized.find(search_normalized)
    if pos >= 0:
        # Map back to original position (approximate)
        return pos

    # Try first 50 chars (shorter match)
    search_short = monologue_text[:50].lower().strip()
    pos = full_lower.find(search_short)
    if pos >= 0:
        return pos

    return None


def main() -> None:
    db = SessionLocal()

    try:
        # Get plays with full_text
        plays_with_text = db.query(Play).filter(Play.full_text.isnot(None)).all()
        print(f"Found {len(plays_with_text)} plays with full_text")

        total_updated = 0
        total_not_found = 0

        for play in plays_with_text:
            print(f"\nProcessing: {play.title} by {play.author}")

            # Get monologues for this play that don't have act/scene yet
            monologues = db.query(Monologue).filter(
                Monologue.play_id == play.id,
                Monologue.act.is_(None)
            ).all()

            print(f"  Found {len(monologues)} monologues without act/scene data")

            updated = 0
            not_found = 0

            for mono in monologues:
                if not mono.text:
                    continue

                # Find where this monologue appears in the play
                pos = find_monologue_position(play.full_text, mono.text)

                if pos is not None:
                    # Get act/scene at this position
                    act, scene = find_act_scene_at_position(play.full_text, pos)

                    if act is not None:
                        mono.act = act
                        mono.scene = scene
                        updated += 1
                    else:
                        not_found += 1
                else:
                    not_found += 1

            db.commit()
            print(f"  Updated {updated} monologues, {not_found} not found in text")
            total_updated += updated
            total_not_found += not_found

        print(f"\n=== Summary ===")
        print(f"Total updated: {total_updated}")
        print(f"Total not found: {total_not_found}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
