#!/usr/bin/env python
"""
Audit: find monologues that are actually scenes (multiple characters speaking)
or mostly stage directions.

Detects:
1. Other character names in ALL CAPS appearing in the text (scene, not monologue)
2. Bracketed/parenthetical stage directions making up a large portion
3. Very short actual dialogue relative to stage directions

Usage:
    uv run python scripts/flag_stage_direction_monologues.py
    uv run python scripts/flag_stage_direction_monologues.py --delete
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play

# Pattern: ALL CAPS word(s) that look like character names in stage directions
# e.g., "EKDAL mutters" or "MRS. HALE sits down"
# Must be 2+ uppercase letters, not common words like "I", "NO", "OH"
COMMON_CAPS = {
    "I", "A", "O", "NO", "OH", "AH", "HA", "HE", "IT", "IF", "IN", "IS",
    "SO", "TO", "UP", "AN", "AT", "BY", "DO", "GO", "ME", "MY", "OF", "ON",
    "OR", "US", "WE", "AM", "AS", "BE", "HI", "OK", "OX",
    "AND", "THE", "BUT", "FOR", "NOT", "YOU", "HER", "HIS", "HIM", "HAS",
    "HAD", "ALL", "ARE", "CAN", "DID", "GET", "GOT", "HAD", "HAS", "HOW",
    "ITS", "LET", "MAY", "NEW", "NOW", "OLD", "ONE", "OUR", "OUT", "OWN",
    "SAY", "SHE", "TOO", "USE", "WAY", "WHO", "BOY", "DID", "MAN", "MEN",
    "PUT", "RAN", "RED", "RUN", "SAW", "SET", "SIT", "TOP", "TWO", "WHY",
    "ACT", "END", "YES",
}

CHARACTER_CUE_RE = re.compile(
    r'\b([A-Z][A-Z]+(?:\.\s*)?(?:\s+[A-Z][A-Z]+)*)\s*[\[(\.]'
    r'|'
    r'\b([A-Z][A-Z]+(?:\.\s*)?(?:\s+[A-Z][A-Z]+)*)\s+_'
)

# Bracketed/parenthetical stage directions
STAGE_DIR_RE = re.compile(r'\[[^\]]{3,}\]|\([^)]{3,}\)')


def analyze_monologue(text: str, character_name: str) -> dict:
    """Analyze a monologue for stage direction / scene contamination."""
    if not text:
        return {"score": 0, "reasons": []}

    reasons = []
    score = 0

    # 1. Find other character names (ALL CAPS cues that aren't the monologue's character)
    char_upper = character_name.upper().split()[0] if character_name else ""
    other_chars = set()
    for match in CHARACTER_CUE_RE.finditer(text):
        name = (match.group(1) or match.group(2) or "").strip().rstrip(".")
        # Skip if it's the monologue's own character or a common word
        words = name.split()
        if all(w in COMMON_CAPS for w in words):
            continue
        if char_upper and words[0] == char_upper:
            continue
        if len(name) >= 2:
            other_chars.add(name)

    if other_chars:
        score += len(other_chars) * 20
        reasons.append(f"Other characters speaking: {', '.join(sorted(other_chars))}")

    # 2. Stage direction content ratio (brackets/parens only, not underscores)
    stage_matches = STAGE_DIR_RE.findall(text)
    stage_len = sum(len(m) for m in stage_matches)
    stage_ratio = stage_len / len(text) if text else 0
    if stage_ratio > 0.3:
        score += int(stage_ratio * 100)
        reasons.append(f"Stage directions: {int(stage_ratio * 100)}% of text")

    # 3. Very short dialogue (under 30 words of actual spoken text)
    clean = STAGE_DIR_RE.sub("", text)
    clean = re.sub(r'\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b', '', clean)  # Remove char names
    clean = re.sub(r'_[^_]+_', '', clean)  # Remove italic stage dirs
    clean = re.sub(r'[\[\](){}]', '', clean)
    word_count = len(clean.split())
    if word_count < 30 and len(text) > 100:
        score += 30
        reasons.append(f"Only ~{word_count} words of dialogue")

    return {"score": score, "reasons": reasons}


def main() -> None:
    delete_mode = "--delete" in sys.argv
    threshold = 20  # minimum score to flag

    db = SessionLocal()
    monologues = db.query(Monologue).join(Play).all()
    flagged = []

    for m in monologues:
        result = analyze_monologue(m.text or "", m.character_name or "")
        if result["score"] >= threshold:
            flagged.append((m, result))

    flagged.sort(key=lambda x: x[1]["score"], reverse=True)

    print(f"\nFound {len(flagged)} problematic monologues (out of {len(monologues)} total)\n")

    for m, result in flagged[:50]:  # Show top 50
        play = m.play
        print(f"  ID {m.id:5d} | score {result['score']:3d} | {m.character_name} in {play.title} by {play.author}")
        for r in result["reasons"]:
            print(f"           | {r}")
        preview = (m.text or "")[:80].replace("\n", " ")
        print(f"           | \"{preview}...\"")
        print()

    if len(flagged) > 50:
        print(f"  ... and {len(flagged) - 50} more\n")

    if delete_mode and flagged:
        confirm = input(f"\nDelete {len(flagged)} monologues? (y/N): ")
        if confirm.strip().lower() == "y":
            for m, _ in flagged:
                db.delete(m)
            db.commit()
            print(f"Deleted {len(flagged)} monologues.")
        else:
            print("Aborted.")
    elif flagged:
        print(f"Run with --delete to remove these monologues.")

    db.close()


if __name__ == "__main__":
    main()
