#!/usr/bin/env python
"""Clean stage-direction artifacts from existing monologues.

DRY-RUN by default — writes a before/after report and changes NOTHING.
`--apply` updates only the rows that become clean after a conservative strip of
`(...)`/`[...]`; structurally broken rows (interleaved speakers, scene headings,
truncation) are never auto-edited — they are listed for manual review.

Buckets per source_type:
  - fixed_by_strip   : flagged, but clean after strip_artifacts  -> safe to auto-apply
  - needs_review     : still flagged after strip
      * structural   : residual interleaved_speaker / caps_residue / scene_heading
                       (multi-speaker or action residue — remove or re-extract)
      * truncation    : residual truncated_end only (citation tail or real cutoff)
      * other         : everything else (length, html, weird_chars)

Usage (from backend/):
    uv run python scripts/clean_monologue_artifacts.py                 # dry-run, all
    uv run python scripts/clean_monologue_artifacts.py --source film
    uv run python scripts/clean_monologue_artifacts.py --apply         # writes fixes
"""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    strip_artifacts,
)
# pylint: enable=wrong-import-position

STRUCTURAL = {"interleaved_speaker", "caps_residue", "scene_heading"}


def classify(text: str):
    """Return (bucket, subbucket, cleaned, residual_reasons)."""
    r = assess_monologue_quality(text)
    if r.ok:
        return "clean", None, text, []
    cleaned = strip_artifacts(text)
    r2 = assess_monologue_quality(cleaned)
    if r2.ok:
        return "fixed_by_strip", None, cleaned, []
    if STRUCTURAL & set(r2.reasons):
        sub = "structural"
    elif r2.reasons == ["truncated_end"]:
        sub = "truncation"
    else:
        sub = "other"
    return "needs_review", sub, cleaned, r2.reasons


BACKUP_PATH = backend_dir / "backups" / "monologue_cleanup_backup_2026-06-07.json"


def restore(backup_path: Path) -> None:
    """Undo: restore original text from a backup file."""
    data = json.loads(backup_path.read_text(encoding="utf-8"))
    db = SessionLocal()
    for mid, original in data.items():
        db.query(Monologue).filter(Monologue.id == int(mid)).update(
            {Monologue.text: original}, synchronize_session=False)
    db.commit()
    db.close()
    print(f"Restored {len(data)} monologues from {backup_path}")


def run(sources: list[str], out_path: Path, apply: bool) -> None:
    db = SessionLocal()
    backup: dict[int, str] = {}
    lines = ["# Monologue Artifact Cleanup — dry run" if not apply
             else "# Monologue Artifact Cleanup — APPLIED", ""]
    lines.append("Strips `(...)`/`[...]`; structurally broken rows are listed, never auto-edited.\n")

    for src in sources:
        rows = (
            db.query(Monologue.id, Play.title, Monologue.text)
            .join(Play, Monologue.play_id == Play.id)
            .filter(Play.source_type == src, Monologue.text.isnot(None))
            .all()
        )
        counts = collections.Counter()
        fixed_samples = []
        review_ids = {"structural": [], "truncation": [], "other": []}
        applied = 0
        for mid, title, text in rows:
            bucket, sub, cleaned, residual = classify(text)
            counts[bucket if bucket != "needs_review" else f"review:{sub}"] += 1
            if bucket == "fixed_by_strip":
                if len(fixed_samples) < 12:
                    fixed_samples.append((mid, title, text, cleaned))
                if apply:
                    backup[mid] = text  # original, for one-command undo
                    db.query(Monologue).filter(Monologue.id == mid).update(
                        {Monologue.text: cleaned}, synchronize_session=False)
                    applied += 1
            elif bucket == "needs_review":
                review_ids[sub].append(mid)

        total = len(rows)
        lines.append(f"## source_type = `{src}`  (total {total})")
        lines.append("")
        for k in ["clean", "fixed_by_strip", "review:structural",
                  "review:truncation", "review:other"]:
            lines.append(f"- {k}: **{counts.get(k, 0)}**")
        lines.append("")
        lines.append("### Sample fixes (before → after)")
        lines.append("")
        for mid, title, before, after in fixed_samples:
            b = " ".join(before.split())
            a = " ".join(after.split())
            lines.append(f"**#{mid} — {title}**")
            lines.append(f"- before: {b[:240]}{'…' if len(b) > 240 else ''}")
            lines.append(f"- after:  {a[:240]}{'…' if len(a) > 240 else ''}")
            lines.append("")
        for sub, ids in review_ids.items():
            lines.append(f"<details><summary>needs_review:{sub} — {len(ids)} ids</summary>\n")
            lines.append(", ".join(str(i) for i in ids))
            lines.append("\n</details>\n")

        print(f"[{src}] total={total} "
              f"fixed={counts.get('fixed_by_strip',0)} "
              f"structural={counts.get('review:structural',0)} "
              f"truncation={counts.get('review:truncation',0)} "
              f"other={counts.get('review:other',0)}"
              + (f"  APPLIED={applied}" if apply else ""))

    if apply:
        BACKUP_PATH.parent.mkdir(parents=True, exist_ok=True)
        BACKUP_PATH.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
        db.commit()
        print(f"Committed {len(backup)} text updates. Backup: {BACKUP_PATH}")
        print(f"Undo with: uv run python scripts/clean_monologue_artifacts.py --restore {BACKUP_PATH}")
    db.close()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report: {out_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["film", "play", "all"], default="all")
    ap.add_argument("--apply", action="store_true", help="write fixes to the DB")
    ap.add_argument("--restore", metavar="BACKUP_JSON", help="undo: restore original text")
    ap.add_argument("--out", default=str(backend_dir.parent / "docs" / "reports"
                                         / "2026-06-07-monologue-cleanup-dryrun.md"))
    args = ap.parse_args()
    if args.restore:
        restore(Path(args.restore))
        return
    sources = ["film", "play"] if args.source == "all" else [args.source]
    run(sources, Path(args.out), args.apply)


if __name__ == "__main__":
    main()
