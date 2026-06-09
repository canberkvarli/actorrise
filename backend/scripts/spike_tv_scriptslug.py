#!/usr/bin/env python
"""Phase-0 spike: prove we can extract CLEAN TV monologues from ScriptSlug teleplay PDFs.

READ-ONLY. Writes nothing to the DB. For a handful of marquee shows it:
  1. finds an episode script slug from ScriptSlug's sitemap,
  2. downloads the teleplay PDF,
  3. extracts monologue candidates with the existing MonologueExtractor,
  4. runs each candidate through the deterministic quality gate,
  5. reports per-show candidates / passed / reject-reasons, plus a sample.

No GPT selection here — the point is to measure mechanical quality (clean,
continuous, single-speaker), not audition-worthiness.

Usage (from backend/):
    uv run python scripts/spike_tv_scriptslug.py
"""

from __future__ import annotations

import collections
import sys
import tempfile
from pathlib import Path

import requests

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.services.extraction.monologue_extractor import MonologueExtractor
from app.services.extraction.monologue_quality import assess_monologue_quality
# pylint: enable=wrong-import-position

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"

SHOWS = [
    "breaking-bad", "euphoria", "succession", "severance", "mad-men",
    "fleabag", "better-call-saul", "the-crown", "game-of-thrones",
    "mr-robot", "the-bear",
]


def episode_slugs() -> dict[str, str]:
    """One episode slug per show, from the sitemap."""
    xml = requests.get(SITEMAP, headers=UA, timeout=30).text
    import re
    locs = re.findall(r"<loc>https://www\.scriptslug\.com/script/([^<]+)</loc>", xml)
    picked: dict[str, str] = {}
    for slug in locs:
        for show in SHOWS:
            if slug.startswith(show) and show not in picked:
                picked[show] = slug
    return picked


def main() -> None:
    extractor = MonologueExtractor()
    picked = episode_slugs()
    print(f"Resolved {len(picked)}/{len(SHOWS)} show episodes from sitemap.\n")

    report = ["# TV Extraction Spike — ScriptSlug teleplay PDFs", ""]
    report.append("Read-only. Existing `MonologueExtractor` + deterministic quality gate. "
                  "No GPT, no DB writes.\n")
    grand_cand = grand_pass = 0
    grand_reasons = collections.Counter()

    for show, slug in picked.items():
        url = PDF_TPL.format(slug=slug)
        try:
            resp = requests.get(url, headers=UA, timeout=60)
            if resp.status_code != 200 or resp.content[:5] != b"%PDF-":
                print(f"  {show}: PDF fetch failed ({resp.status_code})")
                continue
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as fh:
                fh.write(resp.content)
                fh.flush()
                cands = extractor.extract_from_source(fh.name, "pdf",
                                                      min_words=40, max_words=400)
        except Exception as e:  # noqa: BLE001
            print(f"  {show}: error {e}")
            continue

        passed = []
        reasons = collections.Counter()
        for c in cands:
            r = assess_monologue_quality(c.get("text", ""))
            if r.ok:
                passed.append(c)
            else:
                reasons.update(r.reasons)

        grand_cand += len(cands)
        grand_pass += len(passed)
        grand_reasons.update(reasons)
        pct = 100 * len(passed) / len(cands) if cands else 0
        print(f"  {show:18s} slug={slug[:34]:34s} cands={len(cands):3d} "
              f"clean={len(passed):3d} ({pct:3.0f}%)")

        report.append(f"## {show}  (`{slug}`)")
        report.append(f"- candidates: {len(cands)}  |  passed gate: {len(passed)} "
                      f"({pct:.0f}%)  |  rejects: {dict(reasons.most_common())}")
        if passed:
            sample = max(passed, key=lambda c: c.get("word_count", 0))
            txt = " ".join(sample["text"].split())
            report.append(f"- sample clean monologue — **{sample.get('character','?')}** "
                          f"({sample.get('word_count','?')} words):")
            report.append(f"> {txt[:600]}{'…' if len(txt) > 600 else ''}")
        report.append("")

    gp = 100 * grand_pass / grand_cand if grand_cand else 0
    summary = (f"\nTOTAL candidates={grand_cand} clean={grand_pass} ({gp:.0f}%) "
               f"reject_reasons={dict(grand_reasons.most_common())}")
    print(summary)
    report.insert(2, summary.strip() + "\n")

    out = backend_dir.parent / "docs" / "reports" / "2026-06-07-tv-extraction-spike.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(report), encoding="utf-8")
    print(f"\nReport: {out}")


if __name__ == "__main__":
    main()
