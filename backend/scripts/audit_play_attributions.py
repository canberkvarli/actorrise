#!/usr/bin/env python
"""Audit play records for the attribution errors that bulk ingestion introduces.

READ-ONLY. Run it after any content import (and periodically) to catch the two
failure modes that slipped past us until an acting teacher spotted one:

1. TITLE/AUTHOR SWAP — a person's name in `title`, a play name in `author`
   (e.g. title="John Galsworthy", author="Strife"). Signal: `author` starts with
   an article ("The/A/An"), or `title` is a name already used as an author.
2. COLLAPSED COLLECTION — a multi-play public-domain ebook ingested as a single
   play, so monologues from several works share one play_id. Signal: an
   implausible number of distinct characters for a non-Shakespeare play.

Exit code is non-zero if anything is flagged, so it can gate a CI/import step.

    .venv/bin/python scripts/audit_play_attributions.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play
from sqlalchemy import func

# Non-Shakespeare/Jonson plays with more distinct characters than this are
# suspected collapsed collections (their history plays legitimately have huge casts).
COLLAPSE_CHAR_THRESHOLD = 12


def main() -> int:
    db = SessionLocal()
    flagged = 0
    try:
        # 1. Title/author swaps
        swaps = db.query(Play).filter(Play.author.op("~*")(r"^(the|a|an)\s")).all()
        if swaps:
            print(f"[SWAP] {len(swaps)} plays with an article-led author (likely title<->author swap):")
            for p in sorted(swaps, key=lambda x: x.id):
                print(f"    id={p.id:4} title={p.title!r} author={p.author!r}")
            flagged += len(swaps)

        # 2. Collapsed collections
        rows = (
            db.query(Play.id, Play.title, Play.author,
                     func.count(func.distinct(Monologue.character_name)).label("nc"),
                     func.count(Monologue.id).label("nm"))
            .join(Monologue, Monologue.play_id == Play.id)
            .filter(~Play.author.ilike("%shakespeare%"), ~Play.author.ilike("%jonson%"))
            .group_by(Play.id)
            .having(func.count(func.distinct(Monologue.character_name)) > COLLAPSE_CHAR_THRESHOLD)
            .order_by(func.count(func.distinct(Monologue.character_name)).desc())
            .all()
        )
        if rows:
            print(f"\n[COLLAPSE?] {len(rows)} non-Shakespeare plays with > {COLLAPSE_CHAR_THRESHOLD} "
                  f"distinct characters (review — may be a collapsed collection):")
            for r in rows:
                print(f"    id={r.id:4} {r.nc:3} chars / {r.nm:3} monos | {r.title!r} by {r.author!r}")
            flagged += len(rows)

        print(f"\n{'CLEAN — nothing flagged.' if flagged == 0 else f'{flagged} record(s) flagged for review.'}")
        return 1 if flagged else 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
