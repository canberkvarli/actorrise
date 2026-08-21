#!/usr/bin/env python
"""Repair source_url values that were stored as Postgres array literals.

ActorRise is a monologue library, not a play library: where a piece comes from
a full script we carry the excerpt and link out to the original. That link is
`plays.source_url`, and the UI already renders it on both the result card
(`MonologueCard.tsx`) and the detail view (`MonologueDetailContent.tsx`).

On 295 of 1,729 plays the link is dead. The scraper collected candidate URLs as
a list and the whole array was stringified into a varchar column:

    {https://imsdb.com/scripts/The-Italian-Job.html,"https://imsdb.com/scripts/Italian-Job,-The.html",https://...}

which reaches the browser as href="{https://imsdb.com/..." and goes nowhere.
Every one of them is a film. Nothing errored, because a varchar accepts any
string — the column simply stopped meaning what it says.

This takes the first well-formed http(s) URL out of the literal. The
alternates are duplicates of the same script under different title spellings
("The Italian Job" / "Italian Job, The"), so there is nothing to preserve; the
schema has no column for alternates anyway.

Rows are only rewritten when a valid URL comes out. A literal that yields
nothing is reported and left alone rather than blanked, because a broken link
is still evidence of where the text came from and blanking it destroys that.

NOT touched: 20 plays with no source_url at all. Every one is `user_uploaded`
— a script the actor supplied — which correctly has no external source.

Usage (from backend/):
    uv run python scripts/fix_source_urls.py           # dry run
    uv run python scripts/fix_source_urls.py --apply
    uv run python scripts/fix_source_urls.py --restore backups/<file>.json
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal
# pylint: enable=wrong-import-position

URL_RE = re.compile(r"^https?://\S+$")


def parse_pg_array(value: str) -> list[str]:
    """Elements of a Postgres array literal: {a,"b,c",d} -> [a, 'b,c', d].

    csv does the quote handling, which matters here: the alternates routinely
    contain commas ("Italian-Job,-The.html"), so a plain split(",") would cut
    a URL in half and produce a link that looks valid and is not.
    """
    inner = value.strip()
    if inner.startswith("{"):
        inner = inner[1:]
    if inner.endswith("}"):
        inner = inner[:-1]
    if not inner:
        return []
    try:
        row = next(csv.reader(io.StringIO(inner), quotechar='"', skipinitialspace=True))
    except StopIteration:
        return []
    return [c.strip().strip('"').strip() for c in row if c and c.strip()]


def first_url(value: str) -> str | None:
    for candidate in parse_pg_array(value):
        if URL_RE.match(candidate):
            return candidate
    return None


def restore(db, path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    for pid, original in data.items():
        db.execute(sa_text("UPDATE plays SET source_url=:u WHERE id=:i"),
                   {"u": original, "i": int(pid)})
    db.commit()
    print(f"restored {len(data)} source_url values from {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            restore(db, Path(args.restore))
            return

        rows = db.execute(sa_text(
            "SELECT id, title, source_url FROM plays "
            "WHERE source_url LIKE '{%' ORDER BY id"
        )).fetchall()

        fixable, unfixable = [], []
        for pid, title, raw in rows:
            url = first_url(raw)
            (fixable if url else unfixable).append((pid, title, raw, url))

        print(f"{len(rows)} plays have an array literal in source_url")
        print(f"  repairable: {len(fixable)}")
        print(f"  no usable URL inside (left alone): {len(unfixable)}")
        for pid, title, raw, _ in unfixable[:10]:
            print(f"    id={pid} {title[:34]!r}: {raw[:70]!r}")

        print("\n  samples:")
        for pid, title, raw, url in fixable[:5]:
            print(f"    id={pid} {title[:28]!r}")
            print(f"      before {raw[:76]!r}")
            print(f"      after  {url!r}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"source_url_fix_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({str(p): r for p, _t, r, _u in fixable},
                                   ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {path}")

        for pid, _title, _raw, url in fixable:
            db.execute(sa_text("UPDATE plays SET source_url=:u WHERE id=:i"),
                       {"u": url, "i": pid})
        db.commit()
        print(f"repaired {len(fixable)} source_url values")
    finally:
        db.close()


if __name__ == "__main__":
    main()
