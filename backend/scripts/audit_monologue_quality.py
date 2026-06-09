#!/usr/bin/env python
"""Audit existing monologues against the deterministic quality gate.

READ-ONLY. Deletes nothing. Runs `assess_monologue_quality` over every monologue
of the chosen source_type(s) and writes a markdown report listing which ones are
dirty and why, so we can decide what to re-extract / clean.

Usage (from backend/):
    uv run python scripts/audit_monologue_quality.py                 # film + play
    uv run python scripts/audit_monologue_quality.py --source film
    uv run python scripts/audit_monologue_quality.py --out ../docs/reports/x.md
"""

from __future__ import annotations

import argparse
import collections
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from app.services.extraction.monologue_quality import assess_monologue_quality
# pylint: enable=wrong-import-position


def _snippet(text: str, n: int = 160) -> str:
    t = " ".join((text or "").split())
    return (t[:n] + "…") if len(t) > n else t


def audit(sources: list[str], out_path: Path, max_examples: int = 60) -> None:
    db = SessionLocal()
    lines: list[str] = ["# Monologue Quality Audit", ""]
    lines.append("Read-only audit against `assess_monologue_quality`. Nothing deleted.\n")

    for src in sources:
        rows = (
            db.query(Monologue.id, Monologue.character_name, Play.title, Monologue.text)
            .join(Play, Monologue.play_id == Play.id)
            .filter(Play.source_type == src, Monologue.text.isnot(None))
            .all()
        )
        total = len(rows)
        reasons = collections.Counter()
        dirty: list[tuple] = []
        for mid, char, title, text in rows:
            r = assess_monologue_quality(text)
            if not r.ok:
                reasons.update(r.reasons)
                dirty.append((mid, title, char, r.reasons, text))

        n_dirty = len(dirty)
        pass_pct = 100 * (total - n_dirty) / total if total else 0.0
        lines.append(f"## source_type = `{src}`")
        lines.append("")
        lines.append(f"- Total: **{total}**")
        lines.append(f"- Pass: **{total - n_dirty}** ({pass_pct:.1f}%)")
        lines.append(f"- Flagged: **{n_dirty}** ({100 - pass_pct:.1f}%)")
        lines.append(f"- Reason breakdown: {dict(reasons.most_common())}")
        lines.append("")
        lines.append(f"### Flagged examples (first {min(max_examples, n_dirty)})")
        lines.append("")
        lines.append("| id | title | character | reasons | snippet |")
        lines.append("|----|-------|-----------|---------|---------|")
        for mid, title, char, rs, text in dirty[:max_examples]:
            t = (title or "").replace("|", "/")
            c = (char or "").replace("|", "/")
            snip = _snippet(text).replace("|", "/")
            lines.append(f"| {mid} | {t} | {c} | {', '.join(rs)} | {snip} |")
        lines.append("")

        # full id list for actioning, kept out of the example table
        all_ids = [mid for mid, *_ in dirty]
        lines.append(f"<details><summary>All {n_dirty} flagged ids</summary>\n")
        lines.append(", ".join(str(i) for i in all_ids))
        lines.append("\n</details>\n")

        print(f"[{src}] total={total} pass={total-n_dirty} ({pass_pct:.1f}%) "
              f"flagged={n_dirty} reasons={dict(reasons.most_common())}")

    db.close()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nReport written to {out_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["film", "play", "all"], default="all")
    ap.add_argument("--out", default=str(backend_dir.parent / "docs" / "reports"
                                         / "2026-06-07-film-monologue-quality-audit.md"))
    args = ap.parse_args()
    sources = ["film", "play"] if args.source == "all" else [args.source]
    audit(sources, Path(args.out))


if __name__ == "__main__":
    main()
