#!/usr/bin/env python
"""Clear plays.full_text where the stored text is a different work.

ActorRise carries monologues, not plays. `plays.full_text` exists only as an
extraction source — nothing user-facing reads it (search defers it, no API
returns it). So text that is not the play it claims to be has no value and one
active cost: it is a live invitation to extract monologues under the wrong
title, which is how the corpus acquired its misattribution problem.

Verified by checking whether the play's own title and author surname appear
anywhere in the first 60k characters of its stored text. 9 of 32 public-domain
plays that hold text and have never yielded a monologue fail BOTH checks:

    id=185  "The Way of the World" (Congreve)   -> The Narrative of Arthur
                                                   Gordon Pym, by Poe
    id=42   "The Lady from the Sea" (Ibsen)     -> 905 kB, neither present
    id=246  "The Lady of the Camellias"         -> 480 kB
    id=255  "The Shadow of the Glen" (Synge)    -> 411 kB
    id=260  "The Well of the Saints" (Synge)    -> 335 kB
    ...

The size is the tell: a single play runs 100-200 kB, so 335-905 kB rows are
collected volumes or, in Congreve's case, an entirely unrelated book that a
silent fetch stored under the wrong row.

`source_url` is left untouched, so the play still links out and the text can be
re-fetched if it is ever wanted. Only the wrong bytes go.

NOT touched: rows whose text verifies, rows with only one of title/author
present (translations legitimately credit a translator rather than the
playwright — Tartuffe's text credits Jeffrey D. Hoeper), and every row that has
already produced monologues.

Usage (from backend/):
    uv run python scripts/clear_wrong_full_text.py           # dry run
    uv run python scripts/clear_wrong_full_text.py --apply
    uv run python scripts/clear_wrong_full_text.py --restore backups/<file>.json
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

HEAD_CHARS = 60_000


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower())


def verify(title: str, author: str, full_text: str) -> tuple[bool, bool]:
    """(title_present, author_present) within the head of the stored text."""
    head = _norm(full_text[:HEAD_CHARS])
    t = _norm(re.sub(r"\(.*?\)", "", title or ""))
    t = re.sub(r"^(the|a|an) ", "", t).strip()
    surname = _norm((author or "").split()[-1]) if author else ""
    return (bool(t) and t in head,
            bool(surname) and len(surname) > 3 and surname in head)


def restore(db, path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    for pid, ft in data.items():
        db.execute(sa_text("UPDATE plays SET full_text=:t WHERE id=:i"),
                   {"t": ft, "i": int(pid)})
    db.commit()
    print(f"restored full_text on {len(data)} plays")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", type=str, default="")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.restore:
            restore(db, Path(args.restore))
            return

        rows = db.execute(sa_text("""
            SELECT p.id, p.title, p.author, p.full_text
            FROM plays p
            WHERE p.full_text IS NOT NULL AND length(p.full_text) > 2000
              AND COALESCE(p.copyright_status,'') = 'public_domain'
              AND NOT EXISTS (SELECT 1 FROM monologues m WHERE m.play_id = p.id)
            ORDER BY p.id
        """)).fetchall()

        wrong, unsure = [], []
        for pid, title, author, ft in rows:
            t_hit, a_hit = verify(title, author, ft)
            if t_hit or a_hit:
                continue
            # Failing both checks is necessary but not sufficient. Several
            # small rows are wiki-markup editions where the title and byline
            # simply are not in the head — id=193 "Daughters of the Rich"
            # opens on "'''MASTERSON''': Who's there? (Sees EDNA.)", which is
            # plausibly the real play in a format the check cannot read.
            #
            # Size settles it. A single play runs 100-200 kB. Every row above
            # that threshold here names its true, different work in the first
            # line, because the fetch matched titles fuzzily: "Lady of the
            # Camellias" -> The Lady of the Lake, "Well of the Saints" -> The
            # War of the Worlds, "Shadow of the Glen" -> Magic Shadows, "The
            # Way of the World" -> The Narrative of Arthur Gordon Pym.
            (wrong if len(ft) > 100_000 else unsure).append((pid, title, author, ft))

        print(f"{len(rows)} candidate plays checked; {len(wrong)} hold a "
              f"different work; {len(unsure)} unverifiable but left alone\n")
        if unsure:
            print("  LEFT ALONE (too small to be sure the text is wrong):")
            for pid, title, _a, ft in unsure:
                print(f"    id={pid:<5} {title[:40]!r} ({len(ft)//1024} kB)")
            print()
        for pid, title, author, ft in wrong:
            print(f"  id={pid:<5} {title[:38]!r} by {str(author)[:22]!r} "
                  f"({len(ft)//1024} kB)")
            print(f"        starts: {re.sub(r'\s+', ' ', ft[:88])!r}")

        if not args.apply:
            print("\n(dry run - pass --apply)")
            return

        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = backend_dir / "backups" / f"wrong_full_text_{stamp}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({str(p): ft for p, _t, _a, ft in wrong},
                                   ensure_ascii=False), encoding="utf-8")
        print(f"\nbackup written: {path} "
              f"({sum(len(ft) for _p, _t, _a, ft in wrong)//1024} kB)")

        for pid, _t, _a, _ft in wrong:
            db.execute(sa_text("UPDATE plays SET full_text=NULL WHERE id=:i"),
                       {"i": pid})
        db.commit()
        print(f"cleared full_text on {len(wrong)} plays (source_url untouched)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
