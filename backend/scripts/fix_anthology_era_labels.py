#!/usr/bin/env python
"""
Data fix: 66 plays labelled "contemporary" that were published 1892-1926.

WHAT WENT WRONG

The ingest took the era label from the ANTHOLOGY TITLE. 57 of the 66 plays
carry a year_written of exactly 1920 (42 plays, 272 monologues) or exactly
1922 (15 plays, 36 monologues) — publication years of the books they were
scraped from, not composition years. The 1920 set is Shay & Loving's *Fifty
Contemporary One-Act Plays*; the 1922 set is its American companion volume.
The word "Contemporary" in those titles means contemporary to 1920, and it is
the entire reason 321 monologues by Chekhov, Strindberg, Shaw, O'Neill, Lady
Gregory, Glaspell and Coward are filed as contemporary drama.

The remaining 9 (1892, 1897, 1900, 1902, 1911, 1919, 1921, 1925, 1926) are
individually-ingested rows with correct years and the same wrong label:
Charley's Aunt, Candida, The Devil's Disciple, The Admirable Crichton,
How He Lied to Her Husband, Heartbreak House, Anna Christie, Hay Fever,
Easy Virtue.

VERDICT: the YEARS ARE RIGHT (or right to the era). The LABEL is wrong on all
66. Nothing here is recoverable as contemporary work.

WHAT THIS CHANGES

Search results: nothing. `era_year_clause` already corrects on year, so these
rows are excluded from contemporary searches today and included in modern
ones (modern is a YEAR_ONLY_ERA — the label is not consulted for it). This
fix stops the CATALOGUE claiming an era it does not have: the admin counts at
GET /monologues/stats, the era lanes in services/actor_lane.py, and the
recommender's genre matching all read the label directly.

It introduces a THIRD value into plays.category, which until now held only
"classical" and "contemporary" — an invariant documented in
services/search/vocabulary.py and services/search/recommender.py. Both
comments are updated in the same commit as this script.

Usage:
    uv run python scripts/fix_anthology_era_labels.py          # dry run
    uv run python scripts/fix_anthology_era_labels.py --apply
"""

from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

# Mirrors era_year_clause: MODERN_START_YEAR <= year < ERA_CUTOFF_YEAR is
# 'modern'. Every row this selects sits inside that window, so the fix is a
# relabel to the era the year already proves, never a judgement call.
SELECT_AFFECTED = """
SELECT p.id, p.title, p.author, p.year_written, count(m.id) AS monologues
FROM plays p LEFT JOIN monologues m ON m.play_id = p.id
WHERE p.source_type = 'play'
  AND p.category ILIKE '%contemporary%'
  AND p.year_written IS NOT NULL
  AND p.year_written >= 1879
  AND p.year_written < 1980
GROUP BY p.id, p.title, p.author, p.year_written
ORDER BY p.year_written, p.title
"""

UPDATE_AFFECTED = """
UPDATE plays SET category = 'modern'
WHERE source_type = 'play'
  AND category ILIKE '%contemporary%'
  AND year_written IS NOT NULL
  AND year_written >= 1879
  AND year_written < 1980
"""


def main() -> None:
    apply = "--apply" in sys.argv
    with engine.begin() as conn:
        rows = conn.execute(text(SELECT_AFFECTED)).fetchall()
        print(f"{len(rows)} plays labelled contemporary, dated 1879-1979:")
        by_year: dict[int, list] = {}
        for row in rows:
            by_year.setdefault(row[3], []).append(row)
        for year in sorted(by_year):
            group = by_year[year]
            pieces = sum(r[4] for r in group)
            print(f"  {year}: {len(group)} plays, {pieces} monologues")
        if not apply:
            print("\nDry run. Re-run with --apply to relabel these as 'modern'.")
            return
        result = conn.execute(text(UPDATE_AFFECTED))
        print(f"\nRelabelled {result.rowcount} plays as 'modern'.")


if __name__ == "__main__":
    main()
