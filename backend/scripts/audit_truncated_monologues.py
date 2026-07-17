#!/usr/bin/env python
"""Audit monologue text for cut-offs and screenplay artifacts. READ-ONLY.

From the 2026-07 search audit: 232 monologues end without terminal
punctuation (41 clearly mid-sentence), 40 contain screenplay artifacts
(CONT'D / V.O. / INT. / EXT.). This script produces the review list; feeding
it into the repair queue (scripts/repair_monologues.py) is a separate,
deliberate step — poems legitimately end unpunctuated, so soft cases need
human eyes, not bulk repair.

Buckets:
    hard_cutoff         ends mid-sentence (comma/colon/lowercase word)
    unclosed_direction  ends inside an unclosed ( or [ stage direction
    screenplay_artifact contains CONT'D / (V.O.) / (O.S.) / INT. / EXT.
    soft_no_punct       no terminal punctuation but ends on a capitalized
                        word — often poetry; review, don't bulk-fix

Usage:
    .venv/bin/python scripts/audit_truncated_monologues.py [--csv out.csv]

Exit code is non-zero when hard buckets are non-empty (CI/import gate).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_TERMINAL_CHARS = ".!?…\"'”’)]"
_ARTIFACT_RE = re.compile(r"\(CONT'D\)|CONT'D|\(V\.O\.\)|\(O\.S\.\)|\bINT\.\s|\bEXT\.\s")


def truncation_reasons(text: str) -> list[str]:
    """Classify one monologue's text. Returns [] when it looks complete."""
    reasons: list[str] = []
    stripped = (text or "").rstrip()
    if not stripped:
        return reasons

    if _ARTIFACT_RE.search(stripped):
        reasons.append("screenplay_artifact")

    if stripped.endswith(tuple(_TERMINAL_CHARS)):
        return reasons

    # Unpunctuated ending — grade it.
    tail = stripped[-120:]
    last_open = max(tail.rfind("("), tail.rfind("["))
    last_close = max(tail.rfind(")"), tail.rfind("]"))
    if last_open > last_close:
        reasons.append("unclosed_direction")
        return reasons

    last_word = re.split(r"\s+", stripped)[-1]
    if stripped[-1] in ",;:" or (last_word and last_word[0].islower()):
        reasons.append("hard_cutoff")
    else:
        reasons.append("soft_no_punct")
    return reasons


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--csv", metavar="OUT_CSV", help="write full flagged rows to CSV")
    args = ap.parse_args()

    from app.core.database import SessionLocal
    from app.models.actor import Monologue, Play

    db = SessionLocal()
    try:
        rows = (
            db.query(Monologue.id, Monologue.title, Monologue.text, Play.source_type)
            .join(Play, Play.id == Monologue.play_id)
            .all()
        )
    finally:
        db.close()

    buckets: dict[str, list[tuple[int, str, str, str]]] = defaultdict(list)
    for mid, title, text, source_type in rows:
        for reason in truncation_reasons(text or ""):
            tail = re.sub(r"\s+", " ", (text or ""))[-60:]
            buckets[reason].append((mid, title or "", source_type or "", tail))

    print(f"scanned {len(rows)} monologues")
    for reason in ("hard_cutoff", "unclosed_direction", "screenplay_artifact", "soft_no_punct"):
        flagged = buckets.get(reason, [])
        print(f"\n[{reason}] {len(flagged)}")
        show = flagged if reason != "soft_no_punct" else flagged[:20]
        for mid, title, st, tail in show:
            print(f"    id={mid:5} [{st:4}] {title[:45]!r} …{tail!r}")
        if reason == "soft_no_punct" and len(flagged) > 20:
            print(f"    … and {len(flagged) - 20} more (see --csv)")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["reason", "monologue_id", "source_type", "title", "tail"])
            for reason, flagged in buckets.items():
                for mid, title, st, tail in flagged:
                    w.writerow([reason, mid, st, title, tail])
        print(f"\ncsv written: {args.csv}")

    hard = sum(len(buckets.get(r, [])) for r in ("hard_cutoff", "unclosed_direction", "screenplay_artifact"))
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
