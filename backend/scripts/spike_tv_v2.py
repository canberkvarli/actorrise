#!/usr/bin/env python
"""Spike v2: screenplay-AWARE extraction from ScriptSlug TV teleplay PDFs.

Same shows as spike_tv_scriptslug.py, but uses the new x-position screenplay
parser instead of the flattening plain-text parser. READ-ONLY, no DB, no GPT.
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
from app.services.extraction.screenplay_pdf_parser import (
    cid_ratio,
    extract_screenplay_monologues,
    lines_from_pdf,
)
from app.services.extraction.monologue_quality import assess_monologue_quality
# pylint: enable=wrong-import-position

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"
SHOWS = ["breaking-bad", "euphoria", "succession", "severance", "mad-men",
         "fleabag", "better-call-saul", "the-crown", "game-of-thrones",
         "mr-robot", "the-bear"]


def pick():
    import re
    xml = requests.get(SITEMAP, headers=UA, timeout=30).text
    locs = re.findall(r"<loc>https://www\.scriptslug\.com/script/([^<]+)</loc>", xml)
    out = {}
    for slug in locs:
        for s in SHOWS:
            if slug.startswith(s) and s not in out:
                out[s] = slug
    return out


def main():
    report = ["# TV Extraction Spike v2 — screenplay-aware parser", ""]
    gc = gp = 0
    reasons = collections.Counter()
    for show, slug in pick().items():
        url = PDF_TPL.format(slug=slug)
        r = requests.get(url, headers=UA, timeout=60)
        if r.status_code != 200 or r.content[:5] != b"%PDF-":
            print(f"  {show:18s} PDF {r.status_code}")
            continue
        with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
            fh.write(r.content); fh.flush()
            cands = extract_screenplay_monologues(fh.name)
            cid = cid_ratio(lines_from_pdf(fh.name))
        clean = [c for c in cands if assess_monologue_quality(c["text"]).ok]
        for c in cands:
            rr = assess_monologue_quality(c["text"])
            if not rr.ok:
                reasons.update(rr.reasons)
        gc += len(cands); gp += len(clean)
        note = " (cid-garbage→skipped)" if cid > 0.05 else ""
        print(f"  {show:18s} cands={len(cands):3d} clean={len(clean):3d}{note}")
        report.append(f"## {show} (`{slug}`)  cands={len(cands)} clean={len(clean)}{note}")
        for c in clean[:2]:
            txt = " ".join(c["text"].split())
            report.append(f"- **{c['character']}** ({c['word_count']}w): {txt[:500]}"
                          + ("…" if len(txt) > 500 else ""))
        report.append("")

    pct = 100 * gp / gc if gc else 0
    summ = f"TOTAL cands={gc} clean={gp} ({pct:.0f}%) rejects={dict(reasons.most_common())}"
    print("\n" + summ)
    report.insert(2, summ + "\n")
    out = backend_dir.parent / "docs" / "reports" / "2026-06-07-tv-extraction-spike-v2.md"
    out.write_text("\n".join(report), encoding="utf-8")
    print("Report:", out)


if __name__ == "__main__":
    main()
