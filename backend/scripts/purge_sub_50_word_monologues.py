#!/usr/bin/env python
"""
Delete monologues under 50 words. They are not monologues.

The 2026-08-20 audit found 810 rows below 50 words — 721 of them TV, where the
scraper cut dialogue exchanges into fragments. 50 words is roughly 20 seconds:
below that a speech is not a piece an actor could work on, and keeping the rows
only preserved the chance of surfacing one by mistake.

Paired with lowering FILM_TV_MIN_WORDS 75 -> 50 in the same change. The old gate
hid everything under 75 words but kept the rows "for later re-extraction"; two
months on, re-extraction never happened and the rows were dead weight hiding a
real problem — 42% of the film/TV corpus was unreachable except by title.

  play    61 rows
  film    28
  tv     721

EXCLUDED: any monologue a user has favorited. One row qualifies. Deleting it
would silently remove a piece from someone's saved collection, which is not
worth doing for one fragment. `monologue_favorites` has no FK to `monologues`,
so nothing would have stopped the delete or cleaned up after it.

Reversal: backups/purge_sub50_<UTC>.json holds every deleted row in full
(text included), so any of them can be reinserted.

Usage:
    uv run python scripts/purge_sub_50_word_monologues.py          # dry run
    uv run python scripts/purge_sub_50_word_monologues.py --apply
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

MIN_WORDS = 50
BACKUP_DIR = backend_dir / "backups"

SELECT_DOOMED = f"""
SELECT m.id, m.play_id, m.title, m.character_name, m.word_count,
       m.text, m.estimated_duration_seconds, COALESCE(p.source_type,'play') st,
       p.title AS play_title
FROM monologues m
JOIN plays p ON p.id = m.play_id
WHERE (m.word_count IS NULL OR m.word_count < {MIN_WORDS})
  AND NOT EXISTS (
        SELECT 1 FROM monologue_favorites f WHERE f.monologue_id = m.id
  )
ORDER BY m.id
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    with engine.begin() as conn:
        rows = conn.execute(text(SELECT_DOOMED)).mappings().fetchall()
        spared = conn.execute(
            text(
                f"SELECT count(*) FROM monologues m WHERE "
                f"(m.word_count IS NULL OR m.word_count < {MIN_WORDS}) AND EXISTS "
                f"(SELECT 1 FROM monologue_favorites f WHERE f.monologue_id = m.id)"
            )
        ).scalar_one()

        by_src: dict[str, int] = {}
        for r in rows:
            by_src[r["st"]] = by_src.get(r["st"], 0) + 1

        print(f"monologues under {MIN_WORDS} words: {len(rows)} to delete")
        for st, n in sorted(by_src.items(), key=lambda kv: -kv[1]):
            print(f"  {st:<6} {n}")
        print(f"  spared (favorited by a user): {spared}")

        print("\nsample:")
        for r in rows[:8]:
            snippet = " ".join((r["text"] or "").split())[:52]
            print(
                f"  #{r['id']:<7} [{r['st']:<4}] {(r['play_title'] or '')[:22]:<24} "
                f"{r['word_count']:>3}w  {snippet!r}"
            )

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        BACKUP_DIR.mkdir(exist_ok=True)
        path = BACKUP_DIR / f"purge_sub50_{stamp}.json"
        path.write_text(
            json.dumps(
                {
                    "created_at": stamp,
                    "min_words": MIN_WORDS,
                    "note": "deleted monologues under 50 words; full rows for reinsert",
                    "rows": [dict(r) for r in rows],
                },
                indent=2,
                default=str,
            )
        )

        ids = [r["id"] for r in rows]
        # monologue_views CASCADEs; submissions and tapes SET NULL. Favorited
        # rows are excluded above, so nothing is orphaned.
        conn.execute(
            text("DELETE FROM monologues WHERE id = ANY(:ids)"), {"ids": ids}
        )
        print(f"\ndeleted {len(ids)} monologues")
        print(f"backup: {path}")


if __name__ == "__main__":
    main()
