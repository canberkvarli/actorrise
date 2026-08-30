#!/usr/bin/env python
"""Build the extraction golden fixture from rows whose verdict is known.

A golden set is only worth having if the expected answers come from somewhere
other than the code being tested. Freezing today's output would lock in today's
bugs. So every case here is one a human checked:

  * BROKEN cases come from the repair backups — their pre-repair text, which was
    read and confirmed broken before the fix ran (#9750 Joker runs backwards
    through the Murray interview; #10774 is 27 fragments and contains another
    character's line).

  * CLEAN cases are multi-paragraph monologues that were sampled during the same
    audit and confirmed to be real, continuous speeches (Taxi Driver,
    Philadelphia's closing argument, Sling Blade, Apocalypse Now). They exist to
    stop the gate getting greedy: fragment count alone would condemn all of them.

Regenerate only when adding a verified case. The fixture is checked in, so the
tests never touch the database.

Usage (from backend/):
    uv run python scripts/build_extraction_golden.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue, Play

_engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)

OUT = backend_dir / "tests" / "fixtures" / "extraction_golden.json"

# Verified during the 2026-08-30 corpus audit. `expect` is what the gate MUST
# say, checked by hand, not read off the implementation.
BROKEN_FROM_BACKUP = {
    9750: "runs backwards through the Murray interview",
    10774: "27 fragments, contains another character's line",
    11369: "contains Lisa's line ('What?')",
    10767: "orphaned answers: 'Yes, that's what's important to me.'",
    10777: "14 fragments of a two-hander",
    10792: "'Yes he does.' / 'Yes! He should be.' answer removed questions",
}

# Real multi-paragraph speeches. Must stay clean or the gate is too greedy.
CLEAN_IDS = {
    9784: "Taxi Driver — Travis",
    10190: "Philadelphia — Joe's closing argument",
    10368: "BlacKkKlansman — Kwame Ture",
    10180: "Marty",
    9955: "Sling Blade — Karl",
    9720: "Apocalypse Now — Willard",
    9691: "Gladiator — Marcus",
    11043: "Notting Hill — William",
}


def main() -> None:
    backups = sorted((backend_dir / "backups").glob("flattened_*.json"))
    if not backups:
        print("no flattened_*.json backup found; cannot recover pre-repair text")
        return
    pre_repair = {
        r["id"]: r["old_text"] for r in json.loads(backups[-1].read_text())
    }

    cases = []
    missing = []

    for mono_id, why in BROKEN_FROM_BACKUP.items():
        text = pre_repair.get(mono_id)
        if not text:
            missing.append(mono_id)
            continue
        cases.append({
            "id": mono_id,
            "note": why,
            "verified": "human-read during the 2026-08-30 audit",
            "text": text,
            "expect_flattened_scene": True,
        })

    db = SessionLocal()
    try:
        for mono_id, label in CLEAN_IDS.items():
            m = (
                db.query(Monologue)
                .join(Play, Play.id == Monologue.play_id)
                .filter(Monologue.id == mono_id)
                .first()
            )
            if not m:
                missing.append(mono_id)
                continue
            cases.append({
                "id": mono_id,
                "note": label,
                "verified": "human-read during the 2026-08-30 audit",
                "text": m.text,
                "expect_flattened_scene": False,
            })
    finally:
        db.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=2, ensure_ascii=False))
    broken = sum(1 for c in cases if c["expect_flattened_scene"])
    print(f"wrote {len(cases)} cases ({broken} broken, {len(cases)-broken} clean) -> {OUT}")
    if missing:
        print(f"could not resolve: {missing}")


if __name__ == "__main__":
    main()
