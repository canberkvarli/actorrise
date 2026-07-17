#!/usr/bin/env python
"""Repair the hard-flagged truncated/artifact monologues from the 2026-07 audit.

DRY-RUN by default — prints proposed repairs and changes NOTHING.

Targets only the hard buckets from scripts/audit_truncated_monologues.py
(hard_cutoff / unclosed_direction / screenplay_artifact). soft_no_punct
(poem-style endings) is deliberately untouched.

Repair strategy, conservative by construction:
  - strip screenplay artifacts (CONT'D / V.O. / O.S. tokens, INT./EXT. scene
    headings, bare ALL-CAPS speaker-header lines)
  - cut a trailing unclosed ( or [ stage direction
  - trim a mid-sentence tail back to the last complete sentence
  - auto-apply ONLY when >= 40 words and >= 60% of the original words survive;
    everything else goes to the manual review queue
    (review_status='pending', surfaced at /admin/monologues/review)

Every applied change is journaled to backups/truncation_repair_backup_<ts>.json
before commit. Embeddings are not regenerated (same precedent as the 2026-06-07
cleanup): kept text is always a prefix of the original, so drift is small.

Usage (from backend/):
    .venv/bin/python scripts/repair_truncated_monologues.py            # dry-run
    .venv/bin/python scripts/repair_truncated_monologues.py --apply
    .venv/bin/python scripts/repair_truncated_monologues.py --restore backups/truncation_repair_backup_*.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from audit_truncated_monologues import truncation_reasons  # noqa: E402

_TERMINAL_CHARS = ".!?…\"'”’)]"
_SENTENCE_END = ".!?…"
_TRAILING_CLOSERS = "\"'”’)]"
_ARTIFACT_TOKEN_RE = re.compile(r"\(CONT'D\)|CONT'D|\(V\.O\.\)|\(O\.S\.\)")
_SPEAKER_HEADER_RE = re.compile(r"[A-Z][A-Z .'\-]{0,39}")

HARD_REASONS = {"hard_cutoff", "unclosed_direction", "screenplay_artifact"}


def strip_screenplay_artifacts(text: str) -> str:
    """Remove screenplay furniture; leave ordinary prose (and its parens) alone."""
    out = []
    for line in text.splitlines():
        if re.match(r"^\s*(?:INT|EXT)\.", line):
            continue
        cleaned = _ARTIFACT_TOKEN_RE.sub("", line)
        if cleaned != line:
            remainder = cleaned.strip()
            # A line that was just "NAME (CONT'D)" collapses to a bare caps
            # speaker header — drop it entirely.
            if not remainder or _SPEAKER_HEADER_RE.fullmatch(remainder):
                continue
            out.append(cleaned.rstrip())
        else:
            out.append(line)
    return "\n".join(out).strip()


def trim_incomplete_tail(text: str) -> str:
    """Cut an unclosed trailing stage direction and/or a mid-sentence tail.

    Returns the text unchanged when it already ends a sentence; returns ""
    when no complete sentence exists to fall back to.
    """
    s = text.rstrip()
    if not s:
        return s

    if not s.endswith(tuple(_TERMINAL_CHARS)):
        tail = s[-120:]
        last_open = max(tail.rfind("("), tail.rfind("["))
        last_close = max(tail.rfind(")"), tail.rfind("]"))
        if last_open > last_close:
            s = s[: len(s) - len(tail) + last_open].rstrip()

    if s and not s.endswith(tuple(_TERMINAL_CHARS)):
        for i in range(len(s) - 1, -1, -1):
            if s[i] in _SENTENCE_END:
                j = i + 1
                while j < len(s) and s[j] in _TRAILING_CLOSERS:
                    j += 1
                return s[:j]
        return ""
    return s


def propose_repair(text: str, min_words: int = 40, min_keep_ratio: float = 0.6):
    """Return (repaired_text, actions). repaired_text is None when the piece
    needs human review instead; equal to `text` when nothing was wrong."""
    actions: list[str] = []
    new = text
    stripped = strip_screenplay_artifacts(new)
    if stripped != new:
        actions.append("stripped_artifacts")
        new = stripped
    trimmed = trim_incomplete_tail(new)
    if trimmed != new:
        actions.append("trimmed_tail")
        new = trimmed
    if not actions:
        return text, []

    orig_words = len(text.split())
    new_words = len(new.split())
    if new_words < min_words or new_words < orig_words * min_keep_ratio:
        return None, actions + ["needs_review"]
    if _looks_garbled(new):
        return None, actions + ["needs_review"]
    return new, actions


def _looks_garbled(text: str, window: int = 80, min_letter_ratio: float = 0.75) -> bool:
    """OCR-noise heuristic: a healthy prose tail is mostly letters; scanned
    screenplay junk ("mp #1888 - Changes 6/4/59 t . ; '") is not. Trimming
    garbage still leaves garbage — those pieces need human review."""
    tail = text[-window:]
    nonspace = sum(1 for c in tail if not c.isspace())
    if not nonspace:
        return False
    letters = sum(1 for c in tail if c.isalpha())
    return letters / nonspace < min_letter_ratio


def _tail(text: str, n: int = 60) -> str:
    return re.sub(r"\s+", " ", text or "")[-n:]


def restore(backup_path: Path) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue
    from app.utils.duration import estimate_duration_seconds

    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        for mid, original in data.items():
            db.query(Monologue).filter(Monologue.id == int(mid)).update(
                {
                    Monologue.text: original,
                    Monologue.word_count: len(original.split()),
                    Monologue.estimated_duration_seconds: estimate_duration_seconds(original),
                    Monologue.review_status: None,
                    Monologue.review_reasons: None,
                },
                synchronize_session=False,
            )
        db.commit()
    finally:
        db.close()
    print(f"Restored {len(data)} monologues from {backup_path}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write repairs (default: dry-run)")
    ap.add_argument("--restore", metavar="BACKUP_JSON", help="undo a previous --apply")
    args = ap.parse_args()

    if args.restore:
        restore(Path(args.restore))
        return 0

    from app.core.database import SessionLocal
    from app.models.actor import Monologue
    from app.utils.duration import estimate_duration_seconds

    db = SessionLocal()
    try:
        rows = db.query(Monologue.id, Monologue.text).all()
        fixes: list[tuple[int, str, str, list[str]]] = []  # id, old, new, actions
        reviews: list[tuple[int, list[str]]] = []
        for mid, text in rows:
            reasons = set(truncation_reasons(text or ""))
            if not (reasons & HARD_REASONS):
                continue
            new, actions = propose_repair(text or "")
            if new is None:
                reviews.append((mid, sorted(reasons) + actions))
            elif new != text:
                fixes.append((mid, text, new, actions))
            else:
                # Flagged but conservatively unstrippable (e.g. screenplay
                # action interleaved mid-text) — human eyes, not automation.
                reviews.append((mid, sorted(reasons) + ["unstrippable"]))

        print(f"auto-fix: {len(fixes)}   review-queue: {len(reviews)}   (dry-run={not args.apply})")
        for mid, old, new, actions in fixes[:12]:
            print(f"  id={mid:5} {'+'.join(actions):30} …{_tail(old)!r}")
            print(f"        {'':30} -> …{_tail(new)!r}")
        if len(fixes) > 12:
            print(f"  … and {len(fixes) - 12} more fixes")
        for mid, why in reviews[:8]:
            print(f"  review id={mid:5} {why}")
        if len(reviews) > 8:
            print(f"  … and {len(reviews) - 8} more for review")

        if not args.apply:
            return 0

        backup_dir = backend_dir / "backups"
        backup_dir.mkdir(exist_ok=True)
        backup_path = backup_dir / f"truncation_repair_backup_{time.strftime('%Y%m%d-%H%M%S')}.json"
        backup = {str(mid): old for mid, old, _, _ in fixes}
        by_id = {mid: text for mid, text in rows}
        backup.update({str(mid): by_id.get(mid) or "" for mid, _ in reviews})
        backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        print(f"backup written: {backup_path}")

        for i, (mid, _, new, _) in enumerate(fixes, 1):
            db.query(Monologue).filter(Monologue.id == mid).update(
                {
                    Monologue.text: new,
                    Monologue.word_count: len(new.split()),
                    Monologue.estimated_duration_seconds: estimate_duration_seconds(new),
                },
                synchronize_session=False,
            )
            if i % 50 == 0:
                db.commit()
        db.commit()

        for mid, why in reviews:
            db.query(Monologue).filter(Monologue.id == mid).update(
                {
                    Monologue.review_status: "pending",
                    Monologue.review_reasons: why,
                },
                synchronize_session=False,
            )
        db.commit()
        print(f"applied {len(fixes)} repairs, queued {len(reviews)} for review")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
