#!/usr/bin/env python
"""Classify `truncated_end`-flagged monologues: real cut-offs vs. fine endings.

Read-only. Looks at rows still flagged `review_status='pending'` whose reasons
include `truncated_end`, and splits them:

  - SOFT (fine): ends on a dash or ellipsis — an intentional interruption /
    trailing-off. Still a valid monologue.
  - HARD (cut off): ends mid-word/clause on a letter, digit, or comma — the text
    was genuinely truncated.

Prints counts + examples so we can decide what to do with the HARD ones.

Usage (from backend/):
    uv run python scripts/scan_truncated_monologues.py
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue

_CLOSERS = "\"'”’)]}»"  # trailing quotes/brackets to peel before inspecting the tail
_DASHES = "-–—"
_SOFT_END = _DASHES + "…"


def _classify(text: str) -> str:
    t = (text or "").rstrip()
    # peel trailing closing quotes/brackets and whitespace
    while t and t[-1] in _CLOSERS + " \t\n":
        t = t[:-1].rstrip()
    if not t:
        return "empty"
    last = t[-1]
    if last in ".!?":
        return "ok"          # not actually truncated after peeling
    if last in _SOFT_END or t.endswith("..."):
        return "soft"        # dash / ellipsis — intentional trail-off
    return "hard"            # letter / digit / comma / etc. — real cut-off


def main() -> None:
    db = SessionLocal()
    rows = (
        db.query(Monologue.id, Monologue.character_name, Monologue.text,
                 Monologue.review_reasons)
        .filter(Monologue.review_status == "pending")
        .all()
    )
    buckets = {"soft": [], "hard": [], "ok": [], "empty": []}
    for mid, char, text, reasons in rows:
        if "truncated_end" not in (reasons or []):
            continue
        buckets[_classify(text)].append((mid, char, text))

    total = sum(len(v) for v in buckets.values())
    print(f"truncated_end rows in queue: {total}")
    for k in ("hard", "soft", "ok", "empty"):
        print(f"  {k:5}: {len(buckets[k])}")

    print("\n--- HARD (genuinely cut off) examples ---")
    for mid, char, text in buckets["hard"][:12]:
        tail = " ".join((text or "").split())[-90:]
        print(f"  #{mid} {char!r}: …{tail!r}")

    print("\n--- SOFT (ends on dash/ellipsis) examples ---")
    for mid, char, text in buckets["soft"][:5]:
        tail = " ".join((text or "").split())[-90:]
        print(f"  #{mid} {char!r}: …{tail!r}")
    db.close()


if __name__ == "__main__":
    main()
