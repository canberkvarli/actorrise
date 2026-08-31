"""Give the StageAgent plays their playwrights back.

`scrape_stageagent.py` writes `author="Unknown"` with an honest comment saying
the monologue page does not expose it. It does not, but the show page it links
to does, in an anchor to `/authors/<id>`. So the name was always one hop away
and nobody made the hop, which is why Our Town and A Streetcar Named Desire sit
in the library credited to nobody.

Two fetches per play: the monologue page for its `/shows/<id>` link, then the
show page for the author anchors. Only the names are read. A playwright's name
is a fact about the work, and crediting them is the opposite of the problem the
rights pass was fixing.

Deliberately NOT done by title-matching against the rest of the corpus, which
looks tempting and is a trap: the film rows share titles with the plays, so
West Side Story matches Steven Spielberg and Murder on the Orient Express
matches Kenneth Branagh. Nor by asking an LLM, which invented plausible
playwrights the last time it was tried on this corpus.

    python -m scripts.backfill_stageagent_authors [--limit N] [--apply]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402
from sqlalchemy import text as sql  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402

BASE = "https://stageagent.com"
HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation)",
    "Accept": "text/html,application/xhtml+xml,application/xml",
}
REQUEST_DELAY = 2.0
TIMEOUT = 30

#: A musical credits book, music and lyrics separately and every one of them is
#: an author of the show. Keep the order the page gives, which is the order the
#: credit is conventionally read in.
MAX_AUTHORS = 4

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"


def _get(url: str) -> str | None:
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(5 * (attempt + 1))
    return None


def show_url_for(monologue_url: str) -> str | None:
    html = _get(monologue_url)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    for a in soup.find_all("a", href=True):
        if re.fullmatch(r"/shows/\d+", a["href"]):
            return BASE + a["href"]
    return None


def authors_from_show(show_url: str) -> list[str]:
    html = _get(show_url)
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    names: list[str] = []
    for a in soup.find_all("a", href=True):
        if not a["href"].startswith("/authors/"):
            continue
        # StageAgent's markup puts a line break inside the credit, so the raw
        # value arrives as "Lynn  Nottage". Left alone that is a different
        # string from the name anyone would search for.
        raw = a.get("title") or a.get_text(" ", strip=True) or ""
        name = re.sub(r"\s+", " ", raw).strip()
        # The page repeats the credit in a couple of places; keep first order.
        if name and name not in names:
            names.append(name)
    return names[:MAX_AUTHORS]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        rows = db.execute(
            sql(
                """
                SELECT p.id, p.title, p.source_url AS src
                FROM plays p
                WHERE (p.author = 'Unknown' OR p.author IS NULL OR p.author = '')
                  AND p.source_url LIKE :pat
                ORDER BY p.title
                """
            ),
            {"pat": "%stageagent%"},
        ).all()
        if args.limit:
            rows = rows[: args.limit]
        print(f"plays to look up: {len(rows)}")
        print(f"~{len(rows) * 2 * REQUEST_DELAY / 60:.0f} min at "
              f"{REQUEST_DELAY}s between fetches\n")

        found, missed = [], []
        for i, r in enumerate(rows, 1):
            show = show_url_for(r.src)
            time.sleep(REQUEST_DELAY)
            names = authors_from_show(show) if show else []
            time.sleep(REQUEST_DELAY)
            if names:
                found.append({"id": r.id, "title": r.title,
                              "author": ", ".join(names), "show": show})
                print(f"  [{i}/{len(rows)}] {r.title[:38]:<38} -> "
                      f"{', '.join(names)}")
            else:
                missed.append({"id": r.id, "title": r.title, "show": show})
                print(f"  [{i}/{len(rows)}] {r.title[:38]:<38} -> NOT FOUND")

        print(f"\nresolved {len(found)}, unresolved {len(missed)}")
        if not args.apply:
            print("dry run, nothing written. re-run with --apply")
            return 0

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = BACKUP_DIR / f"stageagent_authors_{stamp}.json"
        backup.write_text(json.dumps({"found": found, "missed": missed}, indent=2))
        print(f"backup: {backup}")

        written = 0
        for f in found:
            # Only fills a blank. If a human has since credited the play, their
            # answer wins over anything scraped.
            res = db.execute(
                sql(
                    """
                    UPDATE plays SET author = :a
                    WHERE id = :pid
                      AND (author = 'Unknown' OR author IS NULL OR author = '')
                    """
                ),
                {"a": f["author"], "pid": f["id"]},
            )
            written += res.rowcount
            db.commit()
        print(f"authors written: {written}")

        left = db.execute(
            sql(
                "SELECT count(*) FROM plays "
                "WHERE author = 'Unknown' OR author IS NULL OR author = ''"
            )
        ).scalar()
        print(f"plays still uncredited: {left}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
