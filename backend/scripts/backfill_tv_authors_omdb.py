"""Credit the creators on the TV rows that came in without an author.

The StageAgent backfill left 66 plays uncredited, and none of them are plays:
they are TV scripts from ScriptSlug, where the show's creator was never
captured. OMDb's `Writer` field for a series is that person, and it is the same
source that fixed the rest of the TV corpus in August.

Every answer is checked against the title we asked about before it is written.
Without that, a lookup that quietly resolves to a different show writes a
confident wrong name, which is the failure mode the LLM attempt had and the
reason this uses a lookup at all.

    python -m scripts.backfill_tv_authors_omdb [--apply]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import requests  # noqa: E402
from bs4 import BeautifulSoup  # noqa: E402
from sqlalchemy import text as sql  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402

OMDB = "http://www.omdbapi.com/"
DELAY = 0.15
BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"

#: OMDb lists everyone who touched the script on some entries. Past the first
#: few this stops being a credit and starts being a filmography.
MAX_WRITERS = 3


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _clean_writer(raw: str) -> str:
    """OMDb decorates names: 'Vince Gilligan (created by)'."""
    names = []
    for part in (raw or "").split(","):
        name = re.sub(r"\([^)]*\)", "", part).strip()
        if name and name.upper() != "N/A" and name not in names:
            names.append(name)
    return ", ".join(names[:MAX_WRITERS])


def lookup(key: str, title: str) -> tuple[str, str] | None:
    """Return (writer, matched_title) or None when nothing trustworthy came back."""
    for params in ({"t": title, "type": "series"}, {"t": title}):
        try:
            r = requests.get(OMDB, params={"apikey": key, **params}, timeout=20)
            data = r.json()
        except (requests.RequestException, ValueError):
            time.sleep(1)
            continue
        finally:
            time.sleep(DELAY)
        if data.get("Response") != "True":
            continue
        # The guard. OMDb happily resolves a near-miss, and a confident wrong
        # name is worse than leaving the row blank.
        if _norm(data.get("Title")) != _norm(title):
            continue
        writer = _clean_writer(data.get("Writer", ""))
        if writer:
            return writer, data.get("Title", "")
    return None


SCRIPTSLUG_HEADERS = {
    "User-Agent": "ActorRise/1.0 (audition-prep; monologue-curation)",
}


def scriptslug_writers(url: str) -> str:
    """Read the credit off the ScriptSlug page the script came from.

    OMDb knows these shows but returns Writer "N/A" for them, so the title
    resolves and the credit does not. ScriptSlug states it outright, and it is
    where the script came from in the first place.

    Anchored on the "Screenplay by" node rather than the page text, because the
    text also contains a browse widget listing Ari Aster, Christopher Nolan and
    friends under the heading "Writers", which a prose match happily returns.

    Note this credits the source novelist alongside the screenwriter where the
    page does (Ripley gives Zaillian and Highsmith). That is the credit as
    published, and for an adaptation it is the honest answer.
    """
    if not url or "scriptslug" not in url:
        return ""
    try:
        resp = requests.get(url, headers=SCRIPTSLUG_HEADERS, timeout=25)
    except requests.RequestException:
        return ""
    if resp.status_code != 200:
        return ""
    soup = BeautifulSoup(resp.text, "html.parser")
    node = soup.find(string=re.compile(r"Screenplay by"))
    if not node or not node.parent or not node.parent.parent:
        return ""
    names = []
    for a in node.parent.parent.find_all("a"):
        name = re.sub(r"\s+", " ", a.get_text(strip=True)).strip()
        if name and name not in names:
            names.append(name)
    return ", ".join(names[:MAX_WRITERS])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    key = getattr(settings, "omdb_api_key", None) or os.getenv("OMDB_API_KEY")
    if not key:
        print("OMDB_API_KEY not set")
        return 1

    db = SessionLocal()
    try:
        rows = db.execute(
            sql(
                """
                SELECT id, title, source_url,
                       (SELECT count(*) FROM monologues m
                        WHERE m.play_id = plays.id) AS n
                FROM plays
                WHERE author = 'Unknown' OR author IS NULL OR author = ''
                ORDER BY n DESC, title
                """
            )
        ).all()
        print(f"uncredited plays: {len(rows)}")

        found, missed = [], []
        for i, r in enumerate(rows, 1):
            hit = lookup(key, r.title)
            writer = hit[0] if hit else scriptslug_writers(r.source_url)
            if writer:
                src = "omdb" if hit else "scriptslug"
                found.append({"id": r.id, "title": r.title,
                              "author": writer, "via": src})
                print(f"  [{i}/{len(rows)}] {r.title[:34]:<34} -> {writer} ({src})")
            else:
                missed.append({"id": r.id, "title": r.title, "n": r.n})
                print(f"  [{i}/{len(rows)}] {r.title[:34]:<34} -> no confident match")

        print(f"\nresolved {len(found)}, unresolved {len(missed)}")
        if not args.apply:
            print("dry run, nothing written. re-run with --apply")
            return 0

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = BACKUP_DIR / f"tv_authors_omdb_{stamp}.json"
        backup.write_text(json.dumps({"found": found, "missed": missed}, indent=2))
        print(f"backup: {backup}")

        written = 0
        for f in found:
            res = db.execute(
                sql(
                    """
                    UPDATE plays SET author = :a WHERE id = :pid
                      AND (author = 'Unknown' OR author IS NULL OR author = '')
                    """
                ),
                {"a": f["author"], "pid": f["id"]},
            )
            written += res.rowcount
            db.commit()
        print(f"authors written: {written}")
        print(
            "plays still uncredited: "
            + str(
                db.execute(
                    sql(
                        "SELECT count(*) FROM plays WHERE author = 'Unknown' "
                        "OR author IS NULL OR author = ''"
                    )
                ).scalar()
            )
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
