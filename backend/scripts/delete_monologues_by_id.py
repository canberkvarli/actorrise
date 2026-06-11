#!/usr/bin/env python
"""Delete specific monologues by id, with a full JSON backup.

Backs up every targeted row (all columns minus the embedding) before deleting,
and mirrors the admin delete path (clear favorites, unlink submissions).

Usage (from backend/):
    uv run python scripts/delete_monologues_by_id.py 7963 7125 ...          # dry run
    uv run python scripts/delete_monologues_by_id.py --apply 7963 7125 ...
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import inspect as sa_inspect

from app.core.database import SessionLocal
from app.models.actor import Monologue, MonologueFavorite
from app.models.moderation import MonologueSubmission

BACKUP_DIR = backend_dir / "backups"


def _row_to_dict(m: Monologue) -> dict:
    d = {}
    for attr in sa_inspect(Monologue).mapper.column_attrs:
        if attr.key == "embedding_vector":
            continue
        v = getattr(m, attr.key)
        if isinstance(v, datetime):
            v = v.isoformat()
        d[attr.key] = v
    return d


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+", type=int)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--label", default="adhoc", help="backup filename label")
    args = ap.parse_args()

    db = SessionLocal()
    rows = db.query(Monologue).filter(Monologue.id.in_(args.ids)).all()
    found = {m.id for m in rows}
    missing = [i for i in args.ids if i not in found]
    print(f"requested {len(args.ids)} | found {len(rows)} | missing {missing}")

    backup = [_row_to_dict(m) for m in rows]
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    bp = BACKUP_DIR / f"delete_by_id_{args.label}_2026-06-11.json"
    bp.write_text(json.dumps(backup, ensure_ascii=False, default=str), encoding="utf-8")

    if not args.apply:
        print(f"DRY RUN. Backed up to {bp}")
        for m in rows:
            print(f"  #{m.id} {m.character_name!r}: {' '.join((m.text or '').split())[:60]!r}")
        db.close()
        return

    for m in rows:
        db.query(MonologueFavorite).filter(
            MonologueFavorite.monologue_id == m.id).delete(synchronize_session=False)
        db.query(MonologueSubmission).filter(
            MonologueSubmission.monologue_id == m.id).update(
            {MonologueSubmission.monologue_id: None}, synchronize_session=False)
        db.delete(m)
    db.commit()
    db.close()
    print(f"Deleted {len(rows)} monologues. Backup: {bp}")


if __name__ == "__main__":
    main()
