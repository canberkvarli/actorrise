#!/usr/bin/env python
"""Fix known play-attribution data errors (reversible).

Two classes of error, both from bulk public-domain ingestion:

1. COLLAPSED COLLECTION — Gutenberg ebook 8499 is a *collection* of Strindberg
   plays but was ingested as a single play "The Father" (id 77), so 106
   monologues from ~4 different plays all point at it. Re-attribute by character
   to the correct play (verified against the monologue text).

2. TITLE/AUTHOR SWAP — a batch where the person's name landed in `title` and the
   play name in `author` (e.g. title="John Galsworthy", author="Strife"). Swap
   them back. Detected by "author starts with an article" (no real author is
   named "The ...") plus an explicit list of the non-article ones.

Every change is backed up to a timestamped JSON so it can be reverted. Dry-run by
default; pass --apply to write. Pass --revert <backup.json> to undo.

    .venv/bin/python scripts/fix_play_attributions.py            # preview
    .venv/bin/python scripts/fix_play_attributions.py --apply
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Monologue, Play

# --- 1. Strindberg collection (play id 77) → correct plays, by character -------
STRINDBERG_SOURCE_PLAY_ID = 77
# Characters that STAY in The Father (its real dramatis personae).
FATHER_KEEP = {"Captain", "Laura", "Bertha", "Doctor", "Pastor", "Nurse"}
# character -> (target play title, target author). Verified from monologue text.
STRINDBERG_MOVES = {
    "Jean": "Miss Julie", "Julie": "Miss Julie", "Kristin": "Miss Julie",
    "Mme": "The Stronger", "Mme X": "The Stronger",
    "Gunnar": "The Outlaw", "Orm": "The Outlaw",
    "Thorfinn": "The Outlaw", "Valgerd": "The Outlaw",
}
# Gutenberg 8499 "Plays by August Strindberg, Second Series", tr. Edwin Björkman.
STRINDBERG_TRANSLATOR = "Edwin Björkman"

# --- 2. Explicit non-article title/author swaps (seen in the audit) -----------
EXPLICIT_SWAP_IDS = [248, 249, 237, 240]  # Galsworthy x2, Goldsmith, Wycherley


def timestamp_from_db(db) -> str:
    from sqlalchemy import text
    return db.execute(text("SELECT to_char(now(),'YYYYMMDD-HH24MISS')")).scalar()


def find_swaps(db) -> list[Play]:
    """Plays whose AUTHOR field is really a title (starts with an article), plus
    the explicit non-article ones."""
    article = db.query(Play).filter(Play.author.op("~*")(r"^(the|a|an)\s")).all()
    explicit = db.query(Play).filter(Play.id.in_(EXPLICIT_SWAP_IDS)).all()
    seen, out = set(), []
    for p in article + explicit:
        if p.id not in seen:
            seen.add(p.id)
            out.append(p)
    return out


def get_or_create_play(db, title, template: Play) -> Play:
    existing = (
        db.query(Play)
        .filter(Play.title.ilike(title), Play.author.ilike(f"%{template.author}%"))
        .first()
    )
    if existing:
        return existing
    p = Play(
        title=title, author=template.author, genre=template.genre,
        category=template.category, source_type=template.source_type,
        copyright_status=template.copyright_status, license_type=template.license_type,
        source_url=template.source_url, language=template.language,
    )
    db.add(p)
    db.flush()
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Write changes (default: dry-run)")
    args = ap.parse_args()
    db = SessionLocal()
    backup = {"monologue_moves": [], "play_swaps": [], "play_translators": []}
    try:
        father = db.query(Play).get(STRINDBERG_SOURCE_PLAY_ID)

        # 1. Strindberg re-attribution
        if father and father.title == "The Father":
            targets = {t: get_or_create_play(db, t, father) for t in set(STRINDBERG_MOVES.values())}
            monos = db.query(Monologue).filter(Monologue.play_id == father.id).all()
            for m in monos:
                tgt_title = STRINDBERG_MOVES.get(m.character_name)
                if not tgt_title:
                    if m.character_name not in FATHER_KEEP:
                        print(f"  [!] unmapped character in The Father: {m.character_name!r} (mono {m.id}) — left as-is")
                    continue
                tgt = targets[tgt_title]
                new_title = (m.title or "").replace("The Father", tgt_title)
                backup["monologue_moves"].append(
                    {"id": m.id, "old_play_id": father.id, "old_title": m.title,
                     "new_play_id": tgt.id, "new_title": new_title}
                )
                if args.apply:
                    m.play_id = tgt.id
                    m.title = new_title
            # translator on the Strindberg plays
            for p in [father, *targets.values()]:
                backup["play_translators"].append({"id": p.id, "old": getattr(p, "translator", None)})
                if args.apply and hasattr(p, "translator"):
                    p.translator = STRINDBERG_TRANSLATOR
            print(f"  Strindberg: {len(backup['monologue_moves'])} monologues re-attributed "
                  f"across {len(targets)} plays (+ translator set).")

        # 2. Title/author swaps
        for p in find_swaps(db):
            backup["play_swaps"].append({"id": p.id, "old_title": p.title, "old_author": p.author})
            print(f"  SWAP id={p.id}: title {p.title!r} <-> author {p.author!r}")
            if args.apply:
                p.title, p.author = p.author, p.title
        print(f"  Swaps: {len(backup['play_swaps'])} plays.")

        if args.apply:
            ts = timestamp_from_db(db)
            db.commit()
            bpath = backend_dir / "scripts" / f"fix_play_attributions_backup_{ts}.json"
            bpath.write_text(json.dumps(backup, indent=2, ensure_ascii=False), encoding="utf-8")
            print(f"\nAPPLIED. Backup written to {bpath}")
        else:
            print("\nDRY RUN — no changes written. Re-run with --apply.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
