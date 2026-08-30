#!/usr/bin/env python
"""Fold `monologues.character_age_range` onto the vocabulary the app queries.

DRY-RUN by default.

Why: the age filter offers exactly ``teens|20s|30s|40s|50s|60+``
(components/search/SearchFiltersSheet.tsx) and free-text queries map onto the
same set (services/search/query_optimizer.py). The column holds 48 distinct
values — an older numeric scheme ("30-40", "20-30"), StageAgent's printed word
forms ("Young Adult", "Late Teen", "Adult, Mature Adult"), and junk ("900+",
"5"). Roughly 8,700 monologues therefore cannot be reached by the age filter at
all.

It is not only the filter. `embedding_text_builder` writes
``Age: {character_age_range}.`` into the embedded text, while the query side
writes ``Age: 30s.`` from the canonical list — so a row stored as "30-40" is
also being compared against a string it never matches. Any row whose value
changes MUST be re-embedded, or the column and its vector disagree.

Mapping lives in services/extraction/source_adapter.normalize_age_range, so the
backfill and future ingests cannot drift apart.

Usage (from backend/):
    uv run python scripts/normalize_age_ranges.py                  # dry-run
    uv run python scripts/normalize_age_ranges.py --apply
    uv run python scripts/normalize_age_ranges.py --apply --no-reembed
    uv run python scripts/normalize_age_ranges.py --restore backups/age_range_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.actor import Monologue
from app.services.extraction.source_adapter import normalize_age_range

# Dedicated engine: this script holds work open across slow embedding calls and
# pgbouncer will drop a pooled connection underneath it otherwise.
_engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, expire_on_commit=False, bind=_engine
)

BACKUP_DIR = backend_dir / "backups"
BATCH = 100


def restore(path: Path) -> None:
    """Put every backed-up age_range back. Embeddings are NOT restored — re-run
    the script without --no-reembed afterwards if they were regenerated."""
    rows = json.loads(path.read_text())
    db = SessionLocal()
    try:
        for i, row in enumerate(rows, 1):
            m = db.query(Monologue).filter(Monologue.id == row["id"]).first()
            if m:
                m.character_age_range = row["old"]
            if i % BATCH == 0:
                db.commit()
        db.commit()
        print(f"restored {len(rows)} rows from {path.name}")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    ap.add_argument("--no-reembed", action="store_true",
                    help="skip embedding regeneration (leaves vector stale)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--restore", type=Path, default=None)
    args = ap.parse_args()

    if args.restore:
        restore(args.restore)
        return

    # --- Phase 1: read and detach, so no session is held across slow calls ---
    db = SessionLocal()
    try:
        q = db.query(
            Monologue.id, Monologue.character_age_range
        ).filter(Monologue.character_age_range.isnot(None))
        if args.limit:
            q = q.limit(args.limit)
        rows = [{"id": r[0], "old": r[1]} for r in q.all()]
    finally:
        db.close()

    changes: list[dict] = []
    unmapped: Counter = Counter()
    for r in rows:
        new = normalize_age_range(r["old"])
        if new is None:
            # Junk ("900+", "5") or a form the mapper doesn't know. Null it out:
            # an unmatchable string is worse than nothing, because it also
            # poisons the embedded text.
            unmapped[r["old"]] += 1
            new = None
        if new != r["old"]:
            changes.append({"id": r["id"], "old": r["old"], "new": new})

    moves = Counter((c["old"], c["new"]) for c in changes)
    print(f"scanned {len(rows)} rows with a value; {len(changes)} would change\n")
    print(f"{'from':<44} {'to':<8} count")
    for (old, new), n in moves.most_common(30):
        print(f"{str(old):<44} {str(new):<8} {n}")
    if unmapped:
        print(f"\nunmappable (set to NULL): {sum(unmapped.values())} rows")
        for val, n in unmapped.most_common(15):
            print(f"  {val!r}: {n}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return
    if not changes:
        print("\nnothing to do")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    backup = BACKUP_DIR / f"age_range_{ts}.json"
    backup.write_text(json.dumps(changes, indent=2))
    print(f"\nbackup written: {backup}")

    embed_batch = None
    if not args.no_reembed:
        from app.services.ai.embedding_text_builder import (
            build_monologue_enriched_text,
        )
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        embed_batch = generate_embeddings_batch

    # --- Phase 2: write in short transactions ---
    done = 0
    reembedded = 0
    for start in range(0, len(changes), BATCH):
        chunk = changes[start:start + BATCH]
        new_by_id = {c["id"]: c["new"] for c in chunk}
        db = SessionLocal()
        try:
            ms = db.query(Monologue).filter(Monologue.id.in_(list(new_by_id))).all()
            for m in ms:
                m.character_age_range = new_by_id[m.id]
                done += 1

            if embed_batch is not None and ms:
                # The age string is part of the embedded text, so the vector is
                # stale the moment the column changes. One API call per batch
                # rather than one per row — the per-row version took hours and
                # was killed twice before finishing.
                #
                # model/dimensions MUST match ContentAnalyzer.generate_embedding
                # (text-embedding-3-large @ 1536). The batch helper defaults to
                # -small, and a different model means a different vector space:
                # those rows would still be searchable-looking but would never
                # match anything.
                try:
                    vecs = embed_batch(
                        [build_monologue_enriched_text(m) for m in ms],
                        model="text-embedding-3-large",
                        dimensions=1536,
                    )
                    for m, v in zip(ms, vecs):
                        if v:
                            m.embedding_vector = v
                            reembedded += 1
                except Exception as exc:  # noqa: BLE001
                    print(f"  batch re-embed failed at {start}: {exc}")
            db.commit()
        finally:
            db.close()
        print(f"  {done}/{len(changes)} written, {reembedded} re-embedded", flush=True)

    print(f"\napplied {done} rows ({reembedded} re-embedded)")
    print(f"undo: uv run python scripts/normalize_age_ranges.py --restore {backup}")


if __name__ == "__main__":
    main()
