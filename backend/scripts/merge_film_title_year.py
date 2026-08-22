#!/usr/bin/env python
"""Merge film `plays` rows that are the same work reached from two catalogues.

The film ingest keyed rows on source_url, so a film present in both the
original IMSDb pass and the ScriptSlug pass became two rows with the same
title. That is also why filling an empty shell never filled it — the
monologues landed on a fresh row beside the shell, leaving the shell at zero
and the title duplicated.

Grouping is on normalised title AND year, deliberately. Films reuse titles
constantly and the pairs in this corpus are real distinct works:

    Dawn of the Dead     1978 / 2004
    The Apartment        1960 / 1996
    Godzilla             1954 / 2014
    The Little Mermaid   1989 / 2023
    True Grit            1969 / 2010

Merging on title alone would fold a remake into its original — the same class
of mistake as the collapsed anthologies, arrived at from the other direction.
Years within 1 of each other count as the same film (catalogues disagree about
release vs festival year). A row with no year is merged only with other rows
that also lack one.

Canonical row = most monologues, then has a year, then lowest id. Monologues
and scenes are repointed before the emptied rows are deleted.

Usage (from backend/):
    uv run python scripts/merge_film_title_year.py           # dry run
    uv run python scripts/merge_film_title_year.py --apply
    uv run python scripts/merge_film_title_year.py --restore backups/<file>.json
"""

from __future__ import annotations

import argparse
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

YEAR_SLACK = 1


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            data = json.loads(Path(args.restore).read_text(encoding="utf-8"))
            for row in data["plays"]:
                db.execute(sa_text(
                    "INSERT INTO plays (id, title, author, year_written, source_type, "
                    "source_url, copyright_status) VALUES (:id,:title,:author,"
                    ":year_written,:source_type,:source_url,:copyright_status) "
                    "ON CONFLICT (id) DO NOTHING"), row)
            for mid, pid in data["monologues"].items():
                db.execute(sa_text("UPDATE monologues SET play_id=:p WHERE id=:i"),
                           {"p": pid, "i": int(mid)})
            db.commit()
            print(f"restored {len(data['plays'])} plays, "
                  f"{len(data['monologues'])} monologue links")
            return

        rows = db.execute(sa_text("""
            SELECT p.id, p.title, p.author, p.year_written,
                   (SELECT count(*) FROM monologues m WHERE m.play_id=p.id) monos
            FROM plays p WHERE p.source_type='film' ORDER BY p.id
        """)).fetchall()

        by_title: dict[str, list] = {}
        for pid, title, author, yr, monos in rows:
            by_title.setdefault(norm(title), []).append(
                {"id": pid, "title": title, "author": author, "year": yr, "monos": monos})

        merges: list[tuple[dict, list[dict]]] = []
        kept_apart = 0
        for _k, members in by_title.items():
            if len(members) < 2:
                continue
            # Cluster by year so remakes stay separate.
            clusters: list[list[dict]] = []
            for m in sorted(members, key=lambda x: (x["year"] or 0, x["id"])):
                placed = False
                for c in clusters:
                    ref_year = next((x["year"] for x in c if x["year"]), None)
                    if (m["year"] is None) == (ref_year is None) and (
                        ref_year is None or abs(int(m["year"]) - int(ref_year)) <= YEAR_SLACK
                    ):
                        c.append(m)
                        placed = True
                        break
                if not placed:
                    clusters.append([m])
            if len(clusters) > 1:
                kept_apart += 1
            for c in clusters:
                if len(c) < 2:
                    continue
                canonical = sorted(
                    c, key=lambda x: (-x["monos"], x["year"] is None, x["id"]))[0]
                merges.append((canonical, [x for x in c if x["id"] != canonical["id"]]))

        doomed = [x["id"] for _c, extras in merges for x in extras]
        print(f"film rows: {len(rows)}")
        print(f"merge groups: {len(merges)}  rows to delete: {len(doomed)}")
        print(f"same-title groups kept apart by year (remakes): {kept_apart}\n")
        for canonical, extras in merges[:14]:
            yr = canonical["year"] or "?"
            print(f"  keep {canonical['id']} {canonical['title'][:30]!r} ({yr}, "
                  f"{canonical['monos']} monos)  <- "
                  + ", ".join(f"{x['id']}({x['monos']})" for x in extras))

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return
        if not doomed:
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"merge_film_title_year_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        moved = {
            str(r[0]): r[1] for r in db.execute(sa_text(
                "SELECT id, play_id FROM monologues WHERE play_id = ANY(:ids)"),
                {"ids": doomed})
        }
        plays = [dict(r._mapping) for r in db.execute(sa_text(
            "SELECT id, title, author, year_written, source_type, source_url, "
            "copyright_status FROM plays WHERE id = ANY(:ids)"), {"ids": doomed})]
        path.write_text(json.dumps({"plays": plays, "monologues": moved},
                                   ensure_ascii=False, default=str), encoding="utf-8")
        print(f"\nbackup written: {path}")

        for canonical, extras in merges:
            ids = [x["id"] for x in extras]
            db.execute(sa_text("UPDATE monologues SET play_id=:c WHERE play_id = ANY(:ids)"),
                       {"c": canonical["id"], "ids": ids})
            db.execute(sa_text("UPDATE scenes SET play_id=:c WHERE play_id = ANY(:ids)"),
                       {"c": canonical["id"], "ids": ids})
        db.execute(sa_text("DELETE FROM plays WHERE id = ANY(:ids)"), {"ids": doomed})
        db.commit()
        print(f"merged {len(merges)} groups, deleted {len(doomed)} rows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
