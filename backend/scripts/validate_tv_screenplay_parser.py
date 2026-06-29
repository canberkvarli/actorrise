#!/usr/bin/env python
"""Validate the screenplay-aware parser on REAL ScriptSlug TV teleplay PDFs.

READ-ONLY. Writes nothing to the DB. Mirrors the Phase-0 spike's download flow
but runs the NEW `extract_screenplay_monologues` (cue-band segmentation) instead
of the old plain-text PDF path, so we can see real-world output quality before
committing to a full extraction run.

Usage (from backend/):
    .venv/bin/python scripts/validate_tv_screenplay_parser.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import requests

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from app.services.extraction.screenplay_pdf_parser import (
    extract_screenplay_monologues,
    lines_from_pdf,
    cid_ratio,
)
# pylint: enable=wrong-import-position

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"

SHOWS = [
    "breaking-bad", "euphoria", "succession", "severance", "mad-men",
    "fleabag", "better-call-saul", "the-crown", "game-of-thrones",
    "mr-robot", "the-bear", "the-white-lotus", "house-of-the-dragon",
    "the-sopranos", "true-detective",
]


def episode_slugs() -> dict[str, str]:
    import re
    xml = requests.get(SITEMAP, headers=UA, timeout=30).text
    locs = re.findall(r"<loc>https://www\.scriptslug\.com/script/([^<]+)</loc>", xml)
    picked: dict[str, str] = {}
    for slug in locs:
        for show in SHOWS:
            if slug.startswith(show) and show not in picked:
                picked[show] = slug
    return picked


def main() -> None:
    picked = episode_slugs()
    print(f"Resolved {len(picked)}/{len(SHOWS)} show episodes from sitemap.\n")
    total_mono = 0
    image_only = 0
    got = 0
    for show, slug in picked.items():
        url = PDF_TPL.format(slug=slug)
        try:
            resp = requests.get(url, headers=UA, timeout=60)
            if resp.status_code != 200 or resp.content[:5] != b"%PDF-":
                print(f"  {show:20s} PDF fetch failed ({resp.status_code})")
                continue
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as fh:
                fh.write(resp.content)
                fh.flush()
                lines = lines_from_pdf(fh.name)
                cr = cid_ratio(lines)
                monos = extract_screenplay_monologues(fh.name)
        except Exception as e:  # noqa: BLE001
            print(f"  {show:20s} error {e}")
            continue

        got += 1
        if cr > 0.05:
            image_only += 1
            print(f"  {show:20s} IMAGE-ONLY pdf (cid_ratio={cr:.2f}) -> needs OCR, skipped")
            continue
        total_mono += len(monos)
        sample = max(monos, key=lambda m: m["word_count"]) if monos else None
        print(f"  {show:20s} monologues={len(monos):3d}")
        if sample:
            txt = " ".join(sample["dialogue"].split())
            print(f"      e.g. {sample['character']} ({sample['word_count']}w): {txt[:240]}...")
    print(f"\nSHOWS ok={got}  image_only={image_only}  total_clean_monologues={total_mono}")


if __name__ == "__main__":
    main()
