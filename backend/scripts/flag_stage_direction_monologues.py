#!/usr/bin/env python
"""
Audit: find monologues that are mostly stage directions.

Scans all monologues and flags those where stage directions make up
more than 50% of the text. These are likely bad data (scraped stage
directions mixed in with or instead of actual dialogue).

Usage:
    uv run python scripts/flag_stage_direction_monologues.py
    uv run python scripts/flag_stage_direction_monologues.py --delete  # actually delete them
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play

# Patterns that indicate stage directions
STAGE_PATTERNS = [
    re.compile(r'\([^)]*\)'),                    # (parenthetical)
    re.compile(r'\[[^\]]*\]'),                    # [bracketed]
    re.compile(r'_[^_]+_'),                       # _italic stage direction_
    re.compile(r'\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\s+_[^_]+_'),  # CHAR _does something_
    re.compile(r'\b[A-Z]{2,}\b(?=\s+[a-z])'),    # CHARACTER NAME before lowercase text (cue)
]


def stage_direction_ratio(text: str) -> float:
    """Return 0.0-1.0 ratio of text that is stage directions."""
    if not text:
        return 0.0

    total_len = len(text)
    stage_chars = set()

    for pattern in STAGE_PATTERNS:
        for match in pattern.finditer(text):
            for i in range(match.start(), match.end()):
                stage_chars.add(i)

    return len(stage_chars) / total_len


def main() -> None:
    delete_mode = "--delete" in sys.argv
    db = SessionLocal()

    monologues = db.query(Monologue).join(Play).all()
    flagged = []

    for m in monologues:
        ratio = stage_direction_ratio(m.text or "")
        if ratio > 0.5:
            flagged.append((m, ratio))

    flagged.sort(key=lambda x: x[1], reverse=True)

    print(f"\nFound {len(flagged)} monologues with >50% stage directions (out of {len(monologues)} total)\n")

    for m, ratio in flagged:
        play = m.play
        pct = round(ratio * 100)
        preview = (m.text or "")[:80].replace("\n", " ")
        print(f"  ID {m.id:5d} | {pct:3d}% stage | {m.character_name} in {play.title} by {play.author}")
        print(f"           | \"{preview}...\"")

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
        print(f"\nRun with --delete to remove these monologues.")

    db.close()


if __name__ == "__main__":
    main()
