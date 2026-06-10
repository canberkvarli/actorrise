#!/usr/bin/env python
"""Final pass over the monologue review queue: delete garbage, dismiss the rest.

For every row still flagged `review_status='pending'`, judge its CURRENT (library)
text — not the stored AI-proposal reasons:

  - GARBAGE  -> delete (OCR mojibake, screenplay slugs like "DISSOLVE TO"/"CUT TO",
                appended source URLs, interleaved speakers, scene headings,
                HTML/weird chars, heavy ALL-CAPS residue). Backed up first.
  - KEEP     -> a valid monologue only flagged for length or a mid-sentence/dash
                ending. Dismiss it (clear review_status/reasons/proposed_text) so
                it stays in the library and leaves the queue.

DRY-RUN by default. --apply performs the deletes + dismissals.

Usage (from backend/):
    uv run python scripts/finalize_review_queue.py
    uv run python scripts/finalize_review_queue.py --apply
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import inspect as sa_inspect

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite, Play
from app.models.moderation import MonologueSubmission
from app.services.extraction.monologue_quality import assess_monologue_quality

BACKUP_DIR = backend_dir / "backups"

_URL = re.compile(r"https?://|www\.|gutenberg", re.I)
_SCREENPLAY = re.compile(
    r"\b(DISSOLVE TO|CUT TO|SMASH CUT|MATCH CUT|FADE IN|FADE OUT|FADE TO|"
    r"INT\.|EXT\.|ANGLE ON|CLOSE ON|DISSOLVE|CONTINUED|\(V\.?O\.?\)|NARRATOR)\b"
)
_CITATION = re.compile(r"\[For full play text|\[For the full")
_MOJIBAKE = set("•·■�√∆¶†‡")
_CAPS = re.compile(r"\b[A-Z]{4,}\b")
# An ALL-CAPS name used as a speaker cue mid-text: "GLORIA . No harm", "CRAMPTON".
_ALLCAPS_CUE = re.compile(r"\b[A-Z]{3,}\b\s*\.\s+[A-Z]")


def classify(text: str, source_type: str) -> tuple[str, list[str]]:
    """Return (action, signals): 'delete' | 'review' | 'dismiss'.

    - delete : unreadable OCR junk (mojibake / HTML residue / control chars).
    - review : structurally contaminated but possibly a real monologue, OR
               multi-speaker — needs a human (left in the queue).
    - dismiss: only length / dash-ending issues — a valid monologue; clear flag.
    """
    t = text or ""
    r = assess_monologue_quality(t, check_narration=(source_type in {"film", "tv"}))
    reasons = set(r.reasons)

    # 1) Truly corrupt/unreadable text -> delete. Only HTML residue and control/
    #    replacement chars (weird_chars) count; a lone bullet/mid-dot is an OCR
    #    apostrophe error inside an otherwise-readable monologue, so it goes to
    #    review (and is left for a human / future fix), never auto-deleted.
    if reasons & {"weird_chars", "html_residue"}:
        return "delete", sorted(reasons & {"weird_chars", "html_residue"})

    # 2) Structural contamination or multi-speaker -> human review.
    sigs: list[str] = []
    if reasons & {"interleaved_speaker", "scene_heading", "parenthetical_direction",
                  "bracket_cue"}:
        sigs.append("structural")
    if any(ch in _MOJIBAKE for ch in t):
        sigs.append("mojibake")
    if _ALLCAPS_CUE.search(t):
        sigs.append("speaker_cue")
    if _URL.search(t) or _CITATION.search(t):
        sigs.append("url/citation")
    if _SCREENPLAY.search(t):
        sigs.append("screenplay")
    if "narration" in reasons:
        sigs.append("narration")
    if "caps_residue" in reasons and len(set(_CAPS.findall(t))) >= 3:
        sigs.append("caps")
    if sigs:
        return "review", sigs

    # 3) Only length / truncation / clean -> valid monologue, dismiss.
    return "dismiss", sorted(reasons)


def _row_to_dict(m: Monologue) -> dict:
    d = {}
    for attr in sa_inspect(Monologue).mapper.column_attrs:
        if attr.key == "embedding_vector":
            continue
        v = getattr(m, attr.key)
        if isinstance(v, datetime):
            v = v.isoformat()
        d[attr.key] = v
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    rows = (
        db.query(Monologue, Play.source_type)
        .join(Play, Monologue.play_id == Play.id)
        .filter(Monologue.review_status == "pending")
        .all()
    )
    to_delete, to_review, to_dismiss = [], [], []
    for m, src in rows:
        action, sigs = classify(m.text, src)
        {"delete": to_delete, "review": to_review, "dismiss": to_dismiss}[action].append((m, sigs))

    print(f"pending: {len(rows)} | delete(OCR junk): {len(to_delete)} | "
          f"review(left in queue): {len(to_review)} | dismiss(clean): {len(to_dismiss)}")

    backup = [_row_to_dict(m) for m, _ in to_delete]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    bp = BACKUP_DIR / "finalize_garbage_backup_2026-06-11.json"
    bp.write_text(json.dumps(backup, ensure_ascii=False, default=str), encoding="utf-8")

    if not args.apply:
        print(f"DRY RUN. Delete set backed up to {bp}")
        print("DELETE (OCR junk) samples:")
        for m, sigs in to_delete[:12]:
            print(f"  #{m.id} {m.character_name!r} [{','.join(sigs)}] "
                  f"{' '.join((m.text or '').split())[:60]!r}")
        print("REVIEW (left in queue) signal tally:")
        from collections import Counter
        tally = Counter(s for _, sigs in to_review for s in sigs)
        print("  " + ", ".join(f"{k}={v}" for k, v in tally.most_common()))
        print("DISMISS (clean) samples:")
        for m, _ in to_dismiss[:6]:
            print(f"  #{m.id} {m.character_name!r} {' '.join((m.text or '').split())[:60]!r}")
        db.close()
        return

    deleted = 0
    for m, _ in to_delete:
        db.query(MonologueFavorite).filter(
            MonologueFavorite.monologue_id == m.id).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.monologue_id == m.id).update(
            {MonologueSubmission.monologue_id: None}, synchronize_session=False)
        db.delete(m)
        deleted += 1
    dismissed = 0
    for m, _ in to_dismiss:
        m.review_status = None
        m.review_reasons = None
        m.proposed_text = None
        dismissed += 1
    db.commit()
    db.close()
    print(f"Deleted {deleted} OCR-junk, dismissed {dismissed} clean, "
          f"left {len(to_review)} in queue for review. Backup: {bp}")


if __name__ == "__main__":
    main()
