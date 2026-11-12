#!/usr/bin/env python
"""Ingest contemporary monologues from a hand-checked manifest.

Some sources are not a site to crawl: a teacher's audition packet (PDF), a
shared Google Doc, a theatre's audition sides. Each is laid out its own way, so
the splitting is done once, by hand or by a throwaway script, into a manifest,
and this runs the manifest through the SAME gate and writer as
`scrape_contemporary_plays.py`: fair-use ceiling, quality gate, verified year,
library-wide duplicate check.

Manifest (JSON):

    {
      "source": "Anytown HS audition packet 2024",
      "source_url": "https://.../packet.pdf",
      "pieces": [
        {
          "play_title": "Proof", "author": "David Auburn", "character": "Catherine",
          "text": "paragraph one\\n\\nparagraph two",
          "year": 2000,                      # premiere/publication year of the PLAY
          "genre": "drama",                  # or "musical", "comedy"
          "url": "https://publisher/the-play" # optional: where the play is sold
        }
      ]
    }

Rules the manifest must already meet, because nothing here can check them:
the play title and playwright are real and correct, and `year` is the play's,
never the packet's. A piece with no playwright is left out of the manifest.

    .venv/bin/python scripts/ingest_monologue_manifest.py m.json               # dry run
    .venv/bin/python scripts/ingest_monologue_manifest.py m.json --write-rest  # cloud
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scrape_contemporary_plays as scp  # noqa: E402


def load(path: str) -> tuple[list[scp.Parsed], Counter]:
    data = json.loads(Path(path).read_text())
    base = data.get("source_url", "")
    skipped: Counter = Counter()
    out: list[scp.Parsed] = []
    for i, p in enumerate(data["pieces"]):
        title = (p.get("play_title") or "").strip()
        author = (p.get("author") or "").strip()
        character = (p.get("character") or "").strip()
        text = (p.get("text") or "").strip()
        if not (title and author and character and text):
            skipped["missing_field"] += 1
            continue
        paras = [x.strip() for x in text.split("\n\n") if x.strip()]
        # A unique url per piece: the writer keys on it. The fragment is ours.
        url = (p.get("url") or base).split("#")[0] + f"#{i}"
        out.append(scp.Parsed(
            url=url, play_title=title, author=author, character_name=character,
            text="\n\n".join(scp.fit_excerpt(paras)),
            genre=p.get("genre", "drama"), year=p.get("year"),
        ))
    return out, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--write-rest", action="store_true")
    ap.add_argument("--show-rejected", action="store_true")
    ap.add_argument("--max-per-play", type=int, default=12,
                    help="Most pieces to take from one play in one manifest. An "
                         "excerpt policy that took thirty speeches from one play "
                         "would be taking the play.")
    args = ap.parse_args()

    parsed, skipped = load(args.manifest)
    years = scp.load_years()
    rows = [scp.evaluate(p, years) for p in parsed]
    kept, per_play, capped = [], Counter(), 0
    for r in rows:
        if not r.ok:
            continue
        per_play[r.play_title.casefold()] += 1
        if per_play[r.play_title.casefold()] > args.max_per_play:
            capped += 1
            continue
        kept.append(r)
    reasons: Counter = Counter()
    for r in rows:
        for reason in r.reasons:
            reasons[reason] += 1
    print(f"{len(parsed)} pieces ({sum(skipped.values())} skipped: {dict(skipped)})")
    print(f"would insert: {len(kept)}; over the per-play cap: {capped}; "
          f"rejected by the gate: {sum(1 for r in rows if not r.ok)} {dict(reasons)}")
    if args.show_rejected:
        for r in rows:
            if not r.ok:
                print(f"  - {r.character_name}, {r.play_title}: {r.reasons} ({r.word_count}w)")
    if args.write_rest and kept:
        scp.write_via_rest(kept, {p.url: p for p in parsed})


if __name__ == "__main__":
    main()
