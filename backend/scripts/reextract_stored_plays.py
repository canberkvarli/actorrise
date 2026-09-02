"""Re-extract the public-domain plays whose full text we already hold.

Nothing is fetched. These 172 plays were ingested with a parser that cut a
speech at every cue, so a speech somebody answered mid-way arrived as two
fragments and both fell under the word floor. Hedda Gabler ended up with 2
searchable monologues, The Master Builder 5, Rosmersholm 17.

Measured before and after the interruption merge landed:

    before   the parser would extract 3,551 against the 4,068 we had  (worse)
    after    4,776                                                    (better)

That flip is the whole reason to run this. Re-extraction was not worth doing
until the parser could see that an interrupted speech is still one speech.

Everything goes through `ingest_play`, so each candidate meets the same quality
gate, skip list, duplicate check, metadata pass and embedding as any other
source. `find_duplicate` is what makes this safe to re-run: a speech already
stored is recognised and skipped, so this ADDS what the old parser missed rather
than duplicating what it found.

    python -m scripts.reextract_stored_plays [--apply] [--limit N]
    python -m scripts.reextract_stored_plays --purge backups/reextract_<ts>.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models.actor import Monologue, Play  # noqa: E402
from app.services.data_ingestion.pipeline import ingest_play  # noqa: E402
from app.services.extraction.monologue_quality import (  # noqa: E402
    DEFAULT_MAX_WORDS,
    DEFAULT_MIN_WORDS,
)

_engine = create_engine(settings.database_url, pool_size=5, max_overflow=10,
                        pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(autocommit=False, autoflush=False,
                            expire_on_commit=False, bind=_engine)

BACKUP_DIR = backend_dir / "backups"
MIN_TEXT = 5000


def purge(path: Path) -> None:
    """Undo a run: delete what it inserted, restore what it overwrote."""
    data = json.loads(path.read_text())
    ids = data.get("monologue_ids", [])
    replaced = data.get("replaced", [])
    db = SessionLocal()
    try:
        n = db.query(Monologue).filter(Monologue.id.in_(ids)).delete(
            synchronize_session=False) if ids else 0
        for row in replaced:
            db.query(Monologue).filter(Monologue.id == row["id"]).update(
                {
                    Monologue.text: row["text"],
                    Monologue.word_count: row["word_count"],
                    Monologue.estimated_duration_seconds:
                        row["estimated_duration_seconds"],
                    # NULL, not the stored value: the segments described the
                    # text we are putting back, but re-segmenting is cheap and
                    # a wrong second copy is what the reader would serve.
                    Monologue.text_segments: None,
                },
                synchronize_session=False)
        db.commit()
        print(f"deleted {n} inserted, restored {len(replaced)} replaced "
              f"({path.name})")
        if replaced:
            print("NOTE: restored rows keep the NEW embedding; re-embed or "
                  "re-run segmentation if that matters.")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--titles", default=None,
                    help="comma-separated play titles. Without it this touches "
                         "every stored play, and for 158 of the 172 that is a "
                         "lateral move: the old parser already found as much or "
                         "more than the new one does. Only the dozen it failed "
                         "on are worth re-cutting.")
    ap.add_argument("--purge", type=Path, default=None)
    args = ap.parse_args()

    if args.purge:
        purge(args.purge)
        return 0

    analyzer = embed = None
    if args.apply:
        from app.services.ai.content_analyzer import ContentAnalyzer
        from app.services.ai.langchain.embeddings import generate_embeddings_batch
        analyzer, embed = ContentAnalyzer(), generate_embeddings_batch

    db = SessionLocal()
    new_ids: list[int] = []
    replaced_before: list[dict] = []
    totals = {"plays": 0, "candidates": 0, "added": 0, "replaced": 0,
              "dupes": 0, "seen": 0}

    try:
        plays = (
            db.query(Play)
            .filter(Play.copyright_status == "public_domain",
                    Play.full_text.isnot(None))
            .order_by(Play.id)
            .all()
        )
        plays = [p for p in plays if p.full_text and len(p.full_text) > MIN_TEXT]
        if args.titles:
            wanted = {x.strip().lower() for x in args.titles.split(",") if x.strip()}
            plays = [p for p in plays if (p.title or "").lower() in wanted]
        if args.limit:
            plays = plays[: args.limit]

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        bk = BACKUP_DIR / f"reextract_{stamp}.json"

        for play in plays:
            before = (
                db.query(Monologue)
                .filter(Monologue.play_id == play.id,
                        Monologue.review_status.is_(None))
                .count()
            )
            report = ingest_play(
                db,
                title=play.title,
                author=play.author,
                full_text=play.full_text,
                copyright_status=play.copyright_status,
                # Older rows left license_type NULL on public-domain works. The
                # status is what carries the right here, and may_store_text
                # accepts public_domain on its own, but pass it explicitly so
                # the pipeline is never relying on a NULL meaning anything.
                license_type=play.license_type or "public_domain",
                source_url=play.source_url,
                source_type=play.source_type or "play",
                category=play.category or "classical",
                genre=play.genre or "drama",
                min_words=DEFAULT_MIN_WORDS,
                max_words=DEFAULT_MAX_WORDS,
                apply=args.apply,
                # These plays are already in the library. A candidate is
                # almost always a BETTER copy of a stored speech, not a new
                # one, so upgrade the row instead of listing it twice.
                supersede=True,
                analyzer=analyzer,
                embed=embed,
            )
            totals["plays"] += 1
            totals["candidates"] += report.candidates
            totals["added"] += report.inserted
            totals["replaced"] += report.superseded
            totals["dupes"] += report.duplicates
            totals["seen"] += report.already_rejected
            new_ids.extend(report.inserted_ids)
            replaced_before.extend(report.superseded_before)

            if report.refused:
                print(f"{play.title[:38]:40s} refused: {report.refused}")
            elif report.inserted or not args.apply:
                print(f"{play.title[:38]:40s} had={before:3d} "
                      f"cands={report.candidates:3d} added={report.inserted:3d} "
                      f"replaced={report.superseded:3d} dupes={report.duplicates:3d}")

            if args.apply:
                # Written after EVERY play, not at the end: an interrupted run
                # still has a complete undo list. Killing the last test run
                # mid-play left 23 rows unlisted that had to be found by hand.
                bk.write_text(json.dumps(
                    {"monologue_ids": new_ids, "replaced": replaced_before},
                    indent=1, default=str))

        print(f"\nplays={totals['plays']} candidates={totals['candidates']} "
              f"added={totals['added']} replaced={totals['replaced']} "
              f"dupes={totals['dupes']} "
              f"already-rejected={totals['seen']}")
        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply.")
            return 0
        print(f"\nundo: python -m scripts.reextract_stored_plays --purge {bk}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
