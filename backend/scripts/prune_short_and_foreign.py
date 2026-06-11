#!/usr/bin/env python
"""Delete short-fragment and non-English monologues.

Two target sets:
  SHORT  - rows in the review queue flagged `too_short` (the only salvageable
           single-speaker part is a fragment, e.g. Hjalmar's 8 words), plus any
           row whose current text is under 40 words.
  FOREIGN- rows whose text is detected as a non-English language with high
           confidence (library-wide).

Every deleted row is backed up (all columns minus the embedding) to JSON first,
and the admin delete path is mirrored (clear favorites, unlink submissions).

DRY-RUN by default. --apply performs the deletes.

Usage (from backend/):
    uv run python scripts/prune_short_and_foreign.py
    uv run python scripts/prune_short_and_foreign.py --apply
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

from langdetect import detect_langs, DetectorFactory, LangDetectException

DetectorFactory.seed = 0  # deterministic results

SHORT_FLOOR = 40       # any monologue shorter than this is a fragment
SHORT_MULTI_MAX = 90   # a multi-speaker scene shorter than this = barely-speaks fragment
FOREIGN_MIN_PROB = 0.92  # high-confidence non-English only
BACKUP_DIR = backend_dir / "backups"

# Other-speaker cues that mark a multi-speaker scene (not a real monologue):
# "MARIA:" and "GREGERS . So I was..." styles.
_SPEAKER_COLON = re.compile(r"(?m)^\s*[A-Z][A-Z0-9 .'’\-]{1,29}:")
_ALLCAPS_CUE = re.compile(r"\b[A-Z]{3,}\b\s*\.\s+[A-Z]")


def _multi_speaker(text: str) -> bool:
    t = text or ""
    return bool(_SPEAKER_COLON.search(t) or _ALLCAPS_CUE.search(t))


def detect_foreign(text: str) -> tuple[str, float] | None:
    """Return (lang, prob) if confidently non-English, else None."""
    t = (text or "").strip()
    if len(t.split()) < 12:  # too short to language-detect reliably
        return None
    try:
        top = detect_langs(t)[0]
    except LangDetectException:
        return None
    if top.lang != "en" and top.prob >= FOREIGN_MIN_PROB:
        return (top.lang, round(top.prob, 3))
    return None


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
    rows = db.query(Monologue, Play.source_type).join(Play, Monologue.play_id == Play.id).all()

    short, foreign = {}, {}  # id -> (monologue, reason)
    for m, _src in rows:
        wc = m.word_count or len((m.text or "").split())
        # "Short" = a genuine fragment: either truly tiny text, or a SHORT
        # multi-speaker scene where the labeled character barely speaks
        # (Hjalmar-type). Length is judged on the CURRENT text, so long real
        # monologues that merely contain caps residue (Perlman 300w, Paul 256w)
        # are NOT swept in.
        is_short = wc < SHORT_FLOOR or (wc < SHORT_MULTI_MAX and _multi_speaker(m.text))
        if is_short:
            short[m.id] = (m, f"short(wc={wc}{',multi' if wc >= SHORT_FLOOR else ''})")
        det = detect_foreign(m.text)
        if det:
            foreign[m.id] = (m, f"foreign({det[0]} p={det[1]})")

    targets = {**short, **foreign}  # union; foreign reason wins on overlap
    print(f"library: {len(rows)} | short: {len(short)} | foreign: {len(foreign)} "
          f"| union to delete: {len(targets)}")

    backup = [_row_to_dict(m) for m, _ in targets.values()]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    bp = BACKUP_DIR / "prune_short_foreign_backup_2026-06-11.json"
    bp.write_text(json.dumps(backup, ensure_ascii=False, default=str), encoding="utf-8")

    if not args.apply:
        print(f"DRY RUN. Target set backed up to {bp}")
        from collections import Counter
        langs = Counter(r.split("(")[1].split(" ")[0] for _, r in foreign.values())
        print(f"foreign languages: {dict(langs)}")
        print("FOREIGN samples:")
        for m, r in list(foreign.values())[:12]:
            print(f"  #{m.id} {m.character_name!r} [{r}] {' '.join((m.text or '').split())[:60]!r}")
        print(f"SHORT samples ({len(short)} total):")
        for m, r in list(short.values())[:22]:
            print(f"  #{m.id} {m.character_name!r} [{r}] {' '.join((m.text or '').split())[:75]!r}")
        db.close()
        return

    deleted = 0
    for m, _ in targets.values():
        db.query(MonologueFavorite).filter(
            MonologueFavorite.monologue_id == m.id).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.monologue_id == m.id).update(
            {MonologueSubmission.monologue_id: None}, synchronize_session=False)
        db.delete(m)
        deleted += 1
    db.commit()
    db.close()
    print(f"Deleted {deleted} ({len(short)} short, {len(foreign)} foreign). Backup: {bp}")


if __name__ == "__main__":
    main()
