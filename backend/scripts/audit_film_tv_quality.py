#!/usr/bin/env python
"""Re-apply the full monologue quality bar to the FILM/TV corpus only.

Canberk's bar (2026-07-20): "need monologues not 1vs1 character scenes or stage
dir or weird languages." The TV corpus predates the >=75-word rule (avg 64
words, 80% under 75), so this pass sweeps film/TV pieces into:

  keep     - a clean single-speaker monologue, >=75 words, English
  salvage  - only strippable stage directions ((beat), [SIGHS]); stripping them
             leaves a clean >=75-word monologue, so we fix the text in place
  remove   - a two-person scene, a non-English piece, a sub-75-word fragment, or
             stage-direction/screenplay residue that can't be cleanly stripped

DRY-RUN by default (writes a report, touches nothing). --apply performs the
salvage edits and deletes, backing up every changed/removed row (minus the
embedding) to JSON first, mirroring the admin delete path (clear favorites,
unlink submissions). Reversible via --restore <backup.json>.

Usage (from backend/):
    .venv/bin/python scripts/audit_film_tv_quality.py            # dry run + report
    .venv/bin/python scripts/audit_film_tv_quality.py --apply
    .venv/bin/python scripts/audit_film_tv_quality.py --restore backups/film_tv_quality_backup_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.extraction.monologue_quality import (  # noqa: E402
    assess_monologue_quality,
    strip_artifacts,
)

MIN_WORDS = 75          # Canberk's bar: too short = never include
NO_CEILING = 100_000    # this pass never removes a piece merely for being long
FOREIGN_MIN_PROB = 0.92

# Reasons from assess_monologue_quality, grouped by what we do with them.
_SCENE = {"interleaved_speaker"}
_STAGE_DIR = {
    "parenthetical_direction", "bracket_cue", "scene_heading", "caps_residue",
    "narration", "html_residue", "join_artifact", "weird_chars",
}
# Strip only fixes parentheticals/brackets; the rest signal deeper breakage.
_STRIPPABLE = {"parenthetical_direction", "bracket_cue"}
_IGNORE = {"truncated_end", "too_long"}  # not this pass (repair pipeline owns truncation)


def _detect_foreign(text: str):
    """Return (lang, prob) if confidently non-English, else None. Lazy import so
    the pure classifier can be tested without the langdetect dependency loaded
    until a real (long, non-English) string reaches it."""
    t = (text or "").strip()
    if len(t.split()) < 12:  # too short to language-detect reliably
        return None
    try:
        from langdetect import DetectorFactory, LangDetectException, detect_langs
        DetectorFactory.seed = 0
        top = detect_langs(t)[0]
    except Exception:
        return None
    if top.lang != "en" and top.prob >= FOREIGN_MIN_PROB:
        return (top.lang, round(top.prob, 3))
    return None


def classify_piece(text: str, source_type: str) -> tuple[str, list[str]]:
    """Route one film/TV piece to ('keep'|'salvage'|'remove', [issue, ...])."""
    raw = (text or "").strip()
    if not raw:
        return "remove", ["empty"]

    check_narration = source_type in ("film", "tv")

    det = _detect_foreign(raw)
    if det:
        return "remove", [f"foreign:{det[0]}"]

    q = assess_monologue_quality(
        raw, min_words=MIN_WORDS, max_words=NO_CEILING, check_narration=check_narration
    )
    reasons = set(q.reasons)

    if reasons & _SCENE:
        return "remove", ["scene"]

    if q.word_count < MIN_WORDS:
        return "remove", ["too_short"]

    stage = reasons & _STAGE_DIR
    if stage:
        # Salvageable only if the trouble is purely strippable parentheticals AND
        # stripping leaves a clean, long-enough, single-speaker monologue.
        if stage <= _STRIPPABLE:
            stripped = strip_artifacts(raw)
            q2 = assess_monologue_quality(
                stripped, min_words=MIN_WORDS, max_words=NO_CEILING,
                check_narration=check_narration,
            )
            bad2 = (set(q2.reasons) & (_SCENE | _STAGE_DIR)) or len(stripped.split()) < MIN_WORDS
            if not bad2:
                return "salvage", ["stage_dir"]
        return "remove", ["stage_dir"]

    return "keep", []


# ── ops (only imported/run from CLI, not exercised by the unit tests) ──────────

def _row_to_dict(m) -> dict:
    from sqlalchemy import inspect as sa_inspect
    d = {}
    for attr in sa_inspect(type(m)).mapper.column_attrs:
        if "embedding" in attr.key:
            continue
        v = getattr(m, attr.key)
        d[attr.key] = v.isoformat() if isinstance(v, datetime) else v
    return d


def _run(apply: bool) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue, MonologueFavorite, Play
    from app.models.moderation import MonologueSubmission

    db = SessionLocal()
    rows = (
        db.query(Monologue, Play.source_type)
        .join(Play, Monologue.play_id == Play.id)
        .filter(Play.source_type.in_(["film", "tv"]))
        .all()
    )

    buckets: dict[str, list] = {"keep": [], "salvage": [], "remove": []}
    issue_counts: Counter = Counter()
    by_src: Counter = Counter()
    for m, src in rows:
        bucket, issues = classify_piece(m.text, src)
        buckets[bucket].append((m, src, issues))
        for i in issues:
            issue_counts[i.split(":")[0]] += 1
        by_src[f"{src}:{bucket}"] += 1

    total = len(rows)
    print(f"film/TV pieces: {total}")
    for b in ("keep", "salvage", "remove"):
        print(f"  {b:8} {len(buckets[b]):5}")
    print("remove/salvage reasons:", dict(issue_counts))
    print("by source:", dict(sorted(by_src.items())))

    # Report with samples (film/TV monologue text — keep local, do not commit).
    report = backend_dir.parent / "film-tv-quality-audit.md"
    lines = [f"# Film/TV quality audit ({datetime.now().date()})", ""]
    lines.append(f"Total film/TV: {total} | keep {len(buckets['keep'])} | "
                 f"salvage {len(buckets['salvage'])} | remove {len(buckets['remove'])}")
    lines.append(f"\nreasons: {dict(issue_counts)}\nby source: {dict(sorted(by_src.items()))}\n")
    for b in ("remove", "salvage"):
        lines.append(f"\n## {b} samples")
        for m, src, issues in buckets[b][:25]:
            head = " ".join((m.text or "").split())[:110]
            lines.append(f"- #{m.id} [{src}] wc={m.word_count} {issues} :: {head!r}")
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nreport: {report}")

    if not apply:
        print("DRY RUN — nothing changed. Re-run with --apply to salvage + delete.")
        db.close()
        return

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = backend_dir / "backups" / f"film_tv_quality_backup_{ts}.json"
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup = {"salvaged": [], "removed": []}
    for m, _src, _i in buckets["salvage"]:
        backup["salvaged"].append(_row_to_dict(m))
    for m, _src, _i in buckets["remove"]:
        backup["removed"].append(_row_to_dict(m))
    backup_path.write_text(json.dumps(backup, ensure_ascii=False, default=str), encoding="utf-8")

    salvaged = 0
    for m, _src, _i in buckets["salvage"]:
        cleaned = strip_artifacts(m.text)
        m.text = cleaned
        m.word_count = len(cleaned.split())
        salvaged += 1
    removed = 0
    for m, _src, _i in buckets["remove"]:
        db.query(MonologueFavorite).filter(
            MonologueFavorite.monologue_id == m.id).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.monologue_id == m.id).update(
            {MonologueSubmission.monologue_id: None}, synchronize_session=False)
        db.delete(m)
        removed += 1
    db.commit()
    db.close()
    print(f"APPLIED: salvaged {salvaged}, removed {removed}. Backup: {backup_path}")


def _restore(path: str) -> None:
    from app.core.database import SessionLocal
    from app.models.actor import Monologue
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    db = SessionLocal()
    restored = 0
    # Salvaged rows still exist (only text/word_count changed) → rewrite them.
    for d in data.get("salvaged", []):
        m = db.query(Monologue).filter(Monologue.id == d["id"]).first()
        if m:
            m.text = d["text"]
            m.word_count = d["word_count"]
            restored += 1
    # Removed rows were deleted → re-insert (embedding will need regeneration).
    for d in data.get("removed", []):
        if db.query(Monologue).filter(Monologue.id == d["id"]).first():
            continue
        db.add(Monologue(**{k: v for k, v in d.items() if hasattr(Monologue, k)}))
        restored += 1
    db.commit()
    db.close()
    print(f"Restored {restored} rows from {path} "
          f"(re-embed re-inserted rows with the embeddings backfill).")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", metavar="BACKUP_JSON")
    args = ap.parse_args()
    if args.restore:
        _restore(args.restore)
    else:
        _run(apply=args.apply)


if __name__ == "__main__":
    main()
