#!/usr/bin/env python
"""Repair the cosmetic defects in the 2026-08-19 film ingest.

Three fixes, none of which touch the dialogue itself except where noted:

1. DOUBLED CHARACTER NAMES (~1.5%). Some ScriptSlug PDFs double-strike the cue
   line, so pdfplumber reads "EGHBAL" as "Eegghhbbaall" and often trails a
   stray paren. The dialogue body is unaffected — only the name doubles — so
   these are repairable rather than junk. Fixed by taking every other letter,
   and only when the whole name is provably doubled.

2. LEADING STAGE DIRECTION (~4.5%). Stored text keeps directions for italic
   rendering, which is intended, but an actor should not open on
   "(continuing)". Only a direction at the very START is removed.

3. ENCODING ARTEFACTS (~4.5%). Characters mangled by the PDF's font map
   ("tho~ght"). Reported, and repaired only where the substitution is
   unambiguous.

Reversible: every changed row is written to backups/ before the update.

Usage (from backend/):
    uv run python scripts/repair_film_ingest.py            # dry run + report
    uv run python scripts/repair_film_ingest.py --apply
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text as sa_text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402

WATERMARK = backend_dir / "backups/ingest_film_watermark.json"

# Unambiguous font-map substitutions seen in these PDFs. Deliberately narrow:
# a wrong "fix" to dialogue is worse than leaving a tilde in.
CHAR_FIXES = {"~": "u"}
_LEADING_DIRECTION = re.compile(r"^\s*\([^)]{0,40}\)\s*")


def is_doubled(name: str) -> bool:
    """True when every letter is repeated in pairs: Jjaammeess -> James."""
    letters = re.sub(r"[^A-Za-z]", "", name or "")
    if len(letters) < 6 or len(letters) % 2:
        return False
    return all(letters[i].lower() == letters[i + 1].lower()
               for i in range(0, len(letters), 2))


def clean_parens(name: str) -> str:
    """Drop cue annotations: complete "(V.O.)", and truncated "(V" tails.

    A bare paren-strip turns "Nixon (V" into "Nixon V" — the orphaned letter
    reads as part of the character's name, which is worse than the original.
    """
    # OCR sometimes reads "(" as "{" or "[", so treat all three alike:
    # "Art {Cont'd)" must become "Art", not "Art {Cont'd".
    n = re.sub(r"[{\[]", "(", name or "")
    n = re.sub(r"[}\]]", ")", n)
    n = re.sub(r"\([^)]*\)", " ", n)   # complete annotations
    n = re.sub(r"\(.*$", " ", n)       # unclosed tail: "(V", "(CONT"
    return re.sub(r"\s+", " ", n.replace(")", " ")).strip()


def undouble(name: str) -> str:
    """Collapse a doubled cue back to its real name, preserving word breaks."""
    out = []
    for word in clean_parens(name).split():
        letters = re.sub(r"[^A-Za-z]", "", word)
        if len(letters) >= 2 and len(letters) % 2 == 0 and all(
            letters[i].lower() == letters[i + 1].lower()
            for i in range(0, len(letters), 2)
        ):
            out.append("".join(letters[i] for i in range(0, len(letters), 2)))
        else:
            out.append(word)
    return " ".join(w for w in out if w).strip()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    mm = json.load(open(WATERMARK))["max_monologue_id"]
    db = SessionLocal()
    rows = db.execute(sa_text(
        "SELECT id, character_name, text FROM monologues WHERE id > :mm ORDER BY id"
    ), {"mm": mm}).fetchall()

    changes, stats = [], Counter()
    for _id, name, body in rows:
        new_name, new_body = name, body or ""

        if is_doubled(name) or (name and re.search(r"[(){}\[\]]", name)):
            candidate = undouble(name)
            if candidate and candidate != name:
                new_name = candidate
                stats["name_undoubled"] += 1

        stripped = _LEADING_DIRECTION.sub("", new_body, count=1)
        if stripped != new_body and stripped.strip():
            new_body = stripped
            stats["leading_direction_removed"] += 1

        for bad, good in CHAR_FIXES.items():
            if bad in new_body:
                new_body = new_body.replace(bad, good)
                stats["encoding_fixed"] += 1

        if new_name != name or new_body != (body or ""):
            changes.append({"id": _id, "old_name": name, "new_name": new_name,
                            "old_text": body, "new_text": new_body})

    print(f"scanned {len(rows)} monologues; {len(changes)} need repair")
    for k, v in stats.most_common():
        print(f"   {k:28s} {v}")
    print("\nname repairs (sample):")
    for ch in [c for c in changes if c["old_name"] != c["new_name"]]:
        print(f"   #{ch['id']}  {ch['old_name']!r} -> {ch['new_name']!r}")

    if not args.apply:
        print("\nDRY RUN — pass --apply to write")
        db.close()
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = backend_dir / f"backups/repair_film_ingest_{stamp}.json"
    backup.write_text(json.dumps(changes, indent=2))
    print(f"\nbackup -> {backup}")

    for ch in changes:
        db.execute(sa_text(
            "UPDATE monologues SET character_name = :n, text = :t WHERE id = :i"
        ), {"n": ch["new_name"], "t": ch["new_text"], "i": ch["id"]})
    db.commit()
    db.close()
    print(f"updated {len(changes)} rows")


if __name__ == "__main__":
    main()
