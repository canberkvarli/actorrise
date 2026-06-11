#!/usr/bin/env python
"""Two cleanups:

A) DROP BAD SHORT FIXES — review-queue entries whose AI `proposed_text` is a tiny
   fragment (<40 words) are a failed extraction, NOT a short monologue (the actual
   text is usually a long real monologue, e.g. Gone Girl 196w). Clear the broken
   proposal and dismiss them from the queue — the monologue itself is KEPT.

B) DEDUPE — delete redundant exact-duplicate monologues, keeping the best copy of
   each group (prefer a non-queued one, then the lowest id). Deleted rows backed up.

DRY-RUN by default. --apply performs both.

Usage (from backend/):
    uv run python scripts/clean_fixes_and_dups.py
    uv run python scripts/clean_fixes_and_dups.py --apply
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
from app.models.actor import Monologue, MonologueFavorite
from app.models.moderation import MonologueSubmission

BACKUP_DIR = backend_dir / "backups"
SHORT_FIX_MAX = 40


def _wc(t: str) -> int:
    return len((t or "").split())


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "")).strip().lower()


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

    # --- A) bad short fixes -> dismiss (keep monologue) ---
    pending = db.query(Monologue).filter(Monologue.review_status == "pending").all()
    bad_fix = [m for m in pending if m.proposed_text and _wc(m.proposed_text) < SHORT_FIX_MAX]

    # --- B) duplicates ---
    rows = db.query(Monologue).all()
    groups: dict[str, list[Monologue]] = {}
    for m in rows:
        if m.text and _wc(m.text) >= 5:
            groups.setdefault(_norm(m.text), []).append(m)
    dup_delete: list[Monologue] = []
    for g in groups.values():
        if len(g) < 2:
            continue
        # keeper: prefer not-pending, then lowest id
        g_sorted = sorted(g, key=lambda m: (m.review_status == "pending", m.id))
        dup_delete.extend(g_sorted[1:])  # delete all but the keeper

    print(f"A) bad short fixes to dismiss: {len(bad_fix)}")
    print(f"B) duplicate groups: {sum(1 for g in groups.values() if len(g) > 1)} "
          f"| redundant copies to delete: {len(dup_delete)}")

    backup = [_row_to_dict(m) for m in dup_delete]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    bp = BACKUP_DIR / "dedupe_backup_2026-06-11.json"
    bp.write_text(json.dumps(backup, ensure_ascii=False, default=str), encoding="utf-8")

    if not args.apply:
        print(f"DRY RUN. Duplicate-delete set backed up to {bp}")
        print("Sample duplicates to delete (keeping one of each):")
        for m in dup_delete[:10]:
            print(f"  del #{m.id} {m.character_name!r}: {' '.join((m.text or '').split())[:55]!r}")
        db.close()
        return

    for m in bad_fix:
        m.review_status = None
        m.review_reasons = None
        m.proposed_text = None
    for m in dup_delete:
        db.query(MonologueFavorite).filter(
            MonologueFavorite.monologue_id == m.id).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.monologue_id == m.id).update(
            {MonologueSubmission.monologue_id: None}, synchronize_session=False)
        db.delete(m)
    db.commit()
    db.close()
    print(f"Dismissed {len(bad_fix)} bad fixes (monologues kept); "
          f"deleted {len(dup_delete)} duplicate copies. Backup: {bp}")


if __name__ == "__main__":
    main()
