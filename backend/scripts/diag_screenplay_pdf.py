#!/usr/bin/env python
"""Diagnose ScriptSlug teleplay PDFs: text vs image, and indentation structure.

Tells us whether a screenplay-aware (x-position) parser is viable per show, or
whether the PDF is image-only (needs OCR). READ-ONLY, no DB.
"""
from __future__ import annotations

import collections
import sys
import tempfile
from pathlib import Path

import pdfplumber
import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
SITEMAP = "https://www.scriptslug.com/sitemap-scripts.xml"
PDF_TPL = "https://assets.scriptslug.com/live/pdf/scripts/{slug}.pdf"
SHOWS = ["game-of-thrones", "succession", "euphoria", "mad-men", "severance"]


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
    for show, slug in pick().items():
        url = PDF_TPL.format(slug=slug)
        r = requests.get(url, headers=UA, timeout=60)
        if r.status_code != 200 or r.content[:5] != b"%PDF-":
            print(f"\n{show}: fetch failed {r.status_code}")
            continue
        with tempfile.NamedTemporaryFile(suffix=".pdf") as fh:
            fh.write(r.content); fh.flush()
            with pdfplumber.open(fh.name) as pdf:
                npages = len(pdf.pages)
                words = []
                for pg in pdf.pages[:8]:
                    words.extend(pg.extract_words())
                nwords = len(words)
                # indentation bands: histogram of rounded x0 (left edge of each word
                # that starts a line is most telling, but all words give the bands)
                bands = collections.Counter(round(w["x0"] / 12) * 12 for w in words)
                print(f"\n=== {show}  ({slug[:40]}) ===")
                print(f"pages={npages}  words(first 8pp)={nwords}  "
                      f"{'IMAGE-ONLY (needs OCR)' if nwords < 40 else 'has text'}")
                if nwords:
                    top = bands.most_common(8)
                    print("x0 bands (px → word count):",
                          ", ".join(f"{x}:{c}" for x, c in sorted(top)))
                    # reconstruct a few lines from a mid page with leading x0
                    midpage = pdf.pages[min(5, npages - 1)]
                    lines = {}
                    for w in midpage.extract_words():
                        key = round(w["top"] / 3)
                        lines.setdefault(key, []).append((w["x0"], w["text"]))
                    sample = list(lines.items())[8:20]
                    for _, ws in sample:
                        ws.sort()
                        x0 = round(ws[0][0])
                        txt = " ".join(t for _, t in ws)
                        print(f"   x0={x0:3d} | {txt[:74]}")


if __name__ == "__main__":
    main()
