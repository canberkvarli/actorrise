#!/usr/bin/env python
"""Recompute word_count and estimated_duration_seconds from the actual text.

`word_count` is a stored column, not a derived one, so every pass that edits
monologue text without touching it leaves the two disagreeing. 876 rows had
drifted by 2026-08-21, a total of 9,876 words.

The drift is not cosmetic — three separate things read the column rather than
the text:

- `film_tv_word_gate_hides()` hides a film/TV piece under FILM_TV_MIN_WORDS
  using `word_count`, so a stale high count keeps a fragment visible and a
  stale low count hides a real speech.
- Duration filters ("2 minute monologue") sort on
  `estimated_duration_seconds`, which is derived from the text at write time
  and never revisited.
- `purge_sub_50_word_monologues.py` selects on `word_count`. After the
  boilerplate strip, 14 rows fell under 50 words in their text while their
  stored count still read ~130, so the purge could not see them.

That last one is why this exists: the 2026-08-21 boilerplate cleanup removed an
average of 58 words per row from 100 rows and did not resync, which would have
left the purge rule quietly unenforceable on exactly the rows it was written
for.

Duration uses `app.utils.duration.estimate_duration_seconds`, the same helper
the admin edit path uses, rather than a re-derived words/150 — the helper also
accounts for breath pauses and dramatic holds.

Usage (from backend/):
    uv run python scripts/resync_word_counts.py           # dry run
    uv run python scripts/resync_word_counts.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

# pylint: disable=wrong-import-position
from sqlalchemy import text as sa_text

from app.core.database import SessionLocal
from app.models.actor import Monologue
from app.utils.duration import estimate_duration_seconds
# pylint: enable=wrong-import-position


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        # Find the drifted ids server-side first. Loading every monologue with
        # its text used to be fine and stopped being fine as the corpus grew —
        # at ~14k rows the single SELECT exceeded what the transaction pooler
        # would carry and the connection closed mid-query. Postgres can compare
        # the stored count against the text without sending either back.
        total = db.execute(sa_text(
            "SELECT count(*) FROM monologues WHERE text IS NOT NULL")).scalar_one()
        ids = [r[0] for r in db.execute(sa_text("""
            SELECT id FROM monologues
            WHERE text IS NOT NULL
              AND COALESCE(word_count, 0) IS DISTINCT FROM
                  array_length(regexp_split_to_array(trim(text), '\\s+'), 1)
            ORDER BY id
        """)).fetchall()]

        drifted = []
        for chunk in (ids[i:i + 500] for i in range(0, len(ids), 500)):
            for m in db.query(Monologue).filter(Monologue.id.in_(chunk)).all():
                actual = len((m.text or "").split())
                if actual != (m.word_count or 0):
                    drifted.append((m, actual, estimate_duration_seconds(m.text)))

        print(f"{total} monologues scanned, {len(drifted)} drifted")
        if drifted:
            worst = sorted(drifted, key=lambda t: abs((t[0].word_count or 0) - t[1]))[-5:]
            print("  largest gaps (stored -> actual):")
            for m, actual, _d in reversed(worst):
                print(f"    id={m.id:<6} {m.word_count} -> {actual}")
            crossing = [t for t in drifted
                        if ((t[0].word_count or 0) >= 50) != (t[1] >= 50)]
            print(f"  rows that cross the 50-word bar once corrected: {len(crossing)}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"word_count_resync_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(
            {str(m.id): [m.word_count, m.estimated_duration_seconds]
             for m, _a, _d in drifted}, ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {path}")

        for m, actual, dur in drifted:
            m.word_count = actual
            m.estimated_duration_seconds = dur
        db.commit()
        print(f"resynced {len(drifted)} rows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
