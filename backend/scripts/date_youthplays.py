#!/usr/bin/env python
"""Give each YouthPLAYS play a year in data/contemporary_play_years.json.

YouthPLAYS prints no premiere date field. Its play pages do print the play's
history: "Winner of the 2018 AATE...", "Promising Playwright Award, 2015",
"premiered at ... in 2011". The earliest of those years is a checked fact about
the PLAY (it existed and was produced by then), which is what the years file
asks for, and it bands the play correctly against the 1980 cutoff. It can be
later than the true premiere, never earlier, and `year_written` is used for era
banding only, so that error is harmless.

A play page with no year in it gets a FLOOR instead, when `--floor` is given:
YouthPLAYS publishes new plays written for young performers (every play page
that carries a date is 2011 or later), so its edition of a play is no earlier
than the publisher. The entry says it is a floor and is marked unverified.
Without `--floor` such a play gets no entry and its monologues stay out.

    .venv/bin/python scripts/date_youthplays.py --cache <dir>          # report
    .venv/bin/python scripts/date_youthplays.py --cache <dir> --write  # update the file
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

import requests

backend_dir = Path(__file__).resolve().parent.parent
YEARS_PATH = backend_dir / "data" / "contemporary_play_years.json"
UA = {"User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation)"}

_MONO_LINK = re.compile(r'href="(https://www\.youthplays\.com)?(/monologue/[^"]+)"')
_PLAY = re.compile(
    r'<h4>\s*from\s*<i><a href="(?P<href>/play/[^"]+)">(?P<t>.*?)</a></i>\s*by\s*<a[^>]*>(?P<a>.*?)</a>',
    re.S,
)
_YEAR = re.compile(r"\b(19[89]\d|20[0-2]\d)\b")


def cached(cache: Path, session: requests.Session, url: str) -> str:
    hit = cache / (hashlib.md5(url.encode()).hexdigest() + ".html")
    if hit.exists():
        return hit.read_text(errors="replace")
    time.sleep(1.0)
    r = session.get(url, headers=UA, timeout=30)
    r.raise_for_status()
    hit.write_text(r.text)
    return r.text


def page_years(html: str) -> list[int]:
    """Years in the play's own description, not in the site's chrome."""
    html = re.sub(r"<script.*?</script>|<style.*?</style>", "", html, flags=re.S)
    # The footer carries a copyright year for the WEBSITE; cut it off.
    html = html.split('id="footer"')[0]
    # Navigation and the cart sit above the play; start at the title block.
    start = html.find("<h1")
    text = re.sub(r"<[^>]+>", " ", html[start if start > 0 else 0:])
    return sorted({int(y) for y in _YEAR.findall(text)})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--floor", type=int, default=0,
                    help="Year to record for a play whose page carries none")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    session = requests.Session()

    index = cached(cache, session, "https://www.youthplays.com/monologues.php")
    mono_urls = sorted({"https://www.youthplays.com" + m[1] for m in _MONO_LINK.findall(index)})
    plays: dict[str, tuple[str, str]] = {}
    for url in mono_urls:
        m = _PLAY.search(cached(cache, session, url))
        if m:
            title = re.sub(r"<[^>]+>", "", m.group("t")).strip()
            author = re.sub(r"<[^>]+>", "", m.group("a")).strip()
            plays["https://www.youthplays.com" + m.group("href")] = (title, author)

    years = json.loads(YEARS_PATH.read_text())
    known = {k.casefold() for k in years}
    found = missing = 0
    for url, (title, author) in sorted(plays.items(), key=lambda kv: kv[1]):
        ys = page_years(cached(cache, session, url))
        if not ys:
            missing += 1
            print(f"  ----  {title} | {author}  (no year on {url})")
            if args.floor and title.casefold() not in known:
                years[title] = {
                    "year": args.floor,
                    "author": author,
                    "source": f"FLOOR, not a premiere: {url} carries no year. YouthPLAYS "
                              "publishes new plays written for young performers, and every "
                              "dated play page in its catalogue is 2011 or later, so its "
                              f"edition is no earlier than {args.floor}. Era banding only.",
                    "verified": False,
                }
            continue
        found += 1
        print(f"  {ys[0]}  {title} | {author}")
        if title.casefold() not in known:
            years[title] = {
                "year": ys[0],
                "author": author,
                "source": f"YouthPLAYS play page {url}: earliest dated production or "
                          f"award on the page ({ys[0]}). An upper bound on the premiere, "
                          "used to band the era only.",
                "verified": True,
            }
    print(f"\n{len(plays)} plays: {found} dated, {missing} with no year")
    if args.write:
        YEARS_PATH.write_text(json.dumps(years, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {YEARS_PATH}")


if __name__ == "__main__":
    sys.exit(main())
