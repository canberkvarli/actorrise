#!/usr/bin/env python
"""
Repair `plays` rows whose title and author are swapped.

Found by the 2026-08-20 dedupe run: six rows carry a playwright's name in
`title` and one of their plays in `author`.

    title='William Congreve'          author='Love for Love'           74 monologues
    title='John Millington Synge'     author='Deirdre of the Sorrows'  73
    title='Arthur Wing Pinero'        author='Dandy Dick'              19
    title='John Millington Synge'     author='Riders to the Sea'        8
    title='Arthur Wing Pinero'        author='Trelawny of the Wells'    0
    title='Richard Brinsley Sheridan' author="St. Patrick's Day"        0

174 monologues are attributed to a "play" named after their own author, so
searching "Love for Love" finds nothing and the browse UI offers a play called
"William Congreve". This is the same defect class the 2026-08 attribution audit
fixed 23 of; these are what it missed.

Detection is conservative and evidence-based, not a name heuristic: a row
qualifies only when its `title` value is used as an `author` on OTHER rows in
the table. That is the corpus telling us the string is a person. Rows where
title and author are identical (ingest debris like 'test') are excluded.

Collision check: swapping must not create a NEW duplicate group. Any row whose
swapped form would collide with an existing (title, author) pair is reported
and skipped rather than merged blind.

Reversal: backups/fix_play_swaps_<UTC>.json holds the before values.

Usage:
    uv run python scripts/fix_play_title_author_swaps.py          # dry run
    uv run python scripts/fix_play_title_author_swaps.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

BACKUP_DIR = backend_dir / "backups"

FIND = """
WITH a AS (
    SELECT DISTINCT btrim(lower(author)) v FROM plays
    WHERE author IS NOT NULL AND btrim(author) <> ''
)
SELECT p.id, p.title, p.author, COALESCE(p.source_type,'play') st,
       (SELECT count(*) FROM monologues m WHERE m.play_id = p.id) monos
FROM plays p
WHERE btrim(lower(p.title)) IN (SELECT v FROM a)
  AND btrim(lower(COALESCE(p.title,''))) <> btrim(lower(COALESCE(p.author,'')))
  AND p.author IS NOT NULL AND btrim(p.author) <> ''
ORDER BY monos DESC, p.id
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    with engine.begin() as conn:
        rows = conn.execute(text(FIND)).mappings().fetchall()
        print(f"swapped rows found: {len(rows)}")

        planned, skipped = [], []
        for r in rows:
            new_title, new_author = r["author"], r["title"]
            collision = conn.execute(
                text(
                    "SELECT id FROM plays WHERE id <> :id "
                    "AND btrim(lower(title)) = btrim(lower(:t)) "
                    "AND btrim(lower(COALESCE(author,''))) = btrim(lower(:a))"
                ),
                {"id": r["id"], "t": new_title, "a": new_author},
            ).fetchall()
            (skipped if collision else planned).append(
                (dict(r), new_title, new_author, [c[0] for c in collision])
            )

        for r, nt, na, _ in planned:
            print(
                f"  #{r['id']:<6} [{r['st']:<4}] {r['title'][:28]!r:<30} / "
                f"{r['author'][:28]!r:<30} -> {nt[:28]!r} by {na[:24]!r}  "
                f"({r['monos']} monologues)"
            )
        for r, nt, na, coll in skipped:
            print(f"  SKIP #{r['id']}: swapped form collides with play id(s) {coll}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = {
            "created_at": stamp,
            "note": "fix_play_title_author_swaps: pre-swap values",
            "rows": [
                {"id": r["id"], "title": r["title"], "author": r["author"]}
                for r, _, _, _ in planned
            ],
        }
        for r, nt, na, _ in planned:
            conn.execute(
                text("UPDATE plays SET title = :t, author = :a WHERE id = :id"),
                {"t": nt, "a": na, "id": r["id"]},
            )

        BACKUP_DIR.mkdir(exist_ok=True)
        path = BACKUP_DIR / f"fix_play_swaps_{stamp}.json"
        path.write_text(json.dumps(backup, indent=2, default=str))
        print(f"\nfixed {len(planned)} rows, skipped {len(skipped)}")
        print(f"backup: {path}")


if __name__ == "__main__":
    main()
