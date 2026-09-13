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
        # Every row with text, not just the ones whose WORD COUNT drifted.
        #
        # The old pre-filter compared the stored count against the text in SQL
        # and only visited the mismatches. That is sound for word_count and
        # blind for duration: a row can hold a perfectly correct word count
        # beside a running time written by a different formula, and this script
        # would never look at it. 14,136 live rows were in exactly that state,
        # because scripts/extract_film_tv_monologues.py used to compute
        # `round(word_count / 2.5)` — a flat 150 wpm with no pauses — against
        # this helper's 130 wpm plus pause accounting, about 25% apart.
        #
        # Duration cannot be recomputed in SQL, so the comparison has to happen
        # in Python. The chunking below is what keeps that safe: the pooler
        # broke on a single SELECT of every row WITH its text, not on 500 at a
        # time, and that loop already existed.
        ids = [r[0] for r in db.execute(sa_text(
            "SELECT id FROM monologues WHERE text IS NOT NULL ORDER BY id"
        )).fetchall()]

        drifted = []
        word_drift = dur_drift = 0
        for chunk in (ids[i:i + 500] for i in range(0, len(ids), 500)):
            for m in db.query(Monologue).filter(Monologue.id.in_(chunk)).all():
                actual = len((m.text or "").split())
                dur = estimate_duration_seconds(m.text)
                bad_words = actual != (m.word_count or 0)
                bad_dur = dur != (m.estimated_duration_seconds or 0)
                if bad_words or bad_dur:
                    word_drift += int(bad_words)
                    dur_drift += int(bad_dur)
                    drifted.append((m, actual, dur))

        print(f"{total} monologues scanned, {len(drifted)} drifted "
              f"({word_drift} word_count, {dur_drift} duration)")
        if drifted:
            worst = sorted(drifted, key=lambda t: abs((t[0].word_count or 0) - t[1]))[-5:]
            print("  largest gaps (stored -> actual):")
            for m, actual, _d in reversed(worst):
                print(f"    id={m.id:<6} {m.word_count} -> {actual}")
            crossing = [t for t in drifted
                        if ((t[0].word_count or 0) >= 50) != (t[1] >= 50)]
            print(f"  rows that cross the 50-word bar once corrected: {len(crossing)}")

            # Running time is what an actor screens on and the one number with
            # a cost when it is wrong: told "two minutes", handed a piece
            # labelled 1:50 that runs 2:01, they get stopped.
            def _band(sec):
                return min(int((sec or 0) // 60), 4)
            moved = sum(1 for m, _a, d in drifted
                        if _band(m.estimated_duration_seconds) != _band(d))
            longer = sum(1 for m, _a, d in drifted
                         if d > (m.estimated_duration_seconds or 0))
            print(f"  rows changing minute band: {moved} "
                  f"({longer} of {len(drifted)} get LONGER)")

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

        # Committed in batches, not in one transaction.
        #
        # This was a single commit, which was right for the 876 rows it was
        # written for and fails at corpus scale: 16,256 UPDATEs in one
        # statement hit Postgres's statement timeout and the whole thing rolled
        # back, so an hour of work landed nothing. Batching also means an
        # interruption keeps what it already wrote, and re-running finishes the
        # rest rather than starting over — the row is only "drifted" until it
        # is correct.
        # One UPDATE ... FROM (VALUES ...) per batch, not one UPDATE per row.
        #
        # Assigning through the ORM emitted 16,256 individual statements and
        # measured 72 rows/min against this database — a three and a half hour
        # run for two columns of integers. The same rows through a VALUES join
        # measured 7,644 rows/min. Writes to `monologues` are expensive here
        # (the table carries an HNSW vector index), so the thing that matters
        # is the number of statements, not the number of rows.
        #
        # Values are ints straight from len() and the estimator, so they are
        # formatted in rather than bound — a VALUES list of 500 rows would
        # otherwise need 1,500 bind parameters. int() is the guard that keeps
        # that honest.
        BATCH = 500
        written = 0
        for i in range(0, len(drifted), BATCH):
            chunk = drifted[i:i + BATCH]
            vals = ",".join(
                f"({int(m.id)},{int(actual)},{int(dur)})" for m, actual, dur in chunk
            )
            db.execute(sa_text(
                f"UPDATE monologues m SET word_count = v.wc,"
                f" estimated_duration_seconds = v.dur, updated_at = now()"
                f" FROM (VALUES {vals}) AS v(id, wc, dur) WHERE m.id = v.id"
            ))
            db.commit()
            written += len(chunk)
            print(f"  committed {written}/{len(drifted)}", flush=True)
        print(f"resynced {written} rows")
    finally:
        db.close()


if __name__ == "__main__":
    main()
