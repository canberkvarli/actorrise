#!/usr/bin/env python
"""Remove shooting-script revision marks from stored monologues. DRY-RUN by default.

Production drafts print an asterisk in the right margin beside every changed
line. The screenplay parser flattens by x-position, so the mark lands inside the
sentence: Joker's speech arrived as "Do you ever actually * leave the studio?".

to_display_text now strips these at extraction (commit b644a5ea), but 172 rows
were ingested before that and still carry them. This is the retroactive pass.

Three things move together and must not drift apart:
  * text            — the mark comes out
  * word_count      — a bare "*" counts as a word in split(), so the stored
                      count is now too high. It is a STORED column; the film/TV
                      word gate and the duration filters read it.
  * embedding_vector — the monologue text is part of the embedded string

Usage (from backend/):
    uv run python scripts/strip_revision_marks.py
    uv run python scripts/strip_revision_marks.py --apply
    uv run python scripts/strip_revision_marks.py --restore backups/revmarks_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue
from app.services.extraction.monologue_quality import strip_revision_marks

_engine = create_engine(
    settings.database_url, pool_size=5, max_overflow=10,
    pool_pre_ping=True, pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, expire_on_commit=False, bind=_engine
)

BACKUP_DIR = backend_dir / "backups"
BATCH = 50


def restore(path: Path) -> None:
    rows = json.loads(path.read_text())
    db = SessionLocal()
    try:
        for r in rows:
            m = db.query(Monologue).filter(Monologue.id == r["id"]).first()
            if m:
                m.text = r["old_text"]
                m.word_count = r["old_word_count"]
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--no-reembed", action="store_true")
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return

    db = SessionLocal()
    try:
        rows = db.query(Monologue.id, Monologue.text, Monologue.word_count).all()
        rows = [{"id": r[0], "old_text": r[1], "old_word_count": r[2]} for r in rows]
    finally:
        db.close()

    changes = []
    for r in rows:
        # Deliberately NOT to_display_text: that also collapses whitespace, which
        # would flatten the paragraph breaks of every legitimate multi-paragraph
        # monologue in the library (Taxi Driver, Philadelphia's closing
        # argument). A dry run showed it touching 1,138 rows instead of the 172
        # that actually carry a revision mark.
        new = strip_revision_marks(r["old_text"])
        if new != r["old_text"]:
            changes.append({
                **r, "new_text": new, "new_word_count": len(new.split()),
            })

    print(f"scanned {len(rows)}; {len(changes)} would change")
    for c in changes[:5]:
        print(f"  {c['id']}: {c['old_word_count']}w -> {c['new_word_count']}w")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return
    if not changes:
        print("nothing to do")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup = BACKUP_DIR / f"revmarks_{ts}.json"
    backup.write_text(json.dumps(changes, indent=2))
    print(f"backup written: {backup}")

    analyzer = None
    if not args.no_reembed:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.embedding_text_builder import build_monologue_enriched_text
        analyzer = ContentAnalyzer()

    done = 0
    for start in range(0, len(changes), BATCH):
        db = SessionLocal()
        try:
            for c in changes[start:start + BATCH]:
                m = db.query(Monologue).filter(Monologue.id == c["id"]).first()
                if not m:
                    continue
                m.text = c["new_text"]
                m.word_count = c["new_word_count"]
                if analyzer is not None:
                    try:
                        m.embedding_vector = analyzer.generate_embedding(
                            build_monologue_enriched_text(m)
                        )
                    except Exception as exc:  # noqa: BLE001
                        print(f"  re-embed failed for {c['id']}: {exc}")
                done += 1
            db.commit()
        finally:
            db.close()
        print(f"  {done}/{len(changes)}")

    print(f"applied {done} rows")
    print(f"undo: uv run python scripts/strip_revision_marks.py --restore {backup}")


if __name__ == "__main__":
    main()
