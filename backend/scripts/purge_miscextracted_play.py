"""Remove monologues that are not dialogue at all, mis-attributed to a real play.

Play 240 is stored as "Love in a Wood" by William Wycherley — a genuine
Restoration comedy — but its `source_url` points at Gutenberg ebook 77733, a
Victorian household-and-cookery manual. All 122 of its "monologues" came from
that book. 90 are recipes; the rest are housekeeping instructions:

    [Rhubarb Jelly]  "Wash, and cut rhubarb into small pieces, put in a kettle
                      with cold water to cover and boil till soft..."
    [To Start A Fire] "Keep ashes in an old tin can and pour over kerosene..."
    [The Kitchen Sink] "If it is convenient, by all means have a row of brass
                      hooks over the sink..."

Not one line is Wycherley. Every piece is embedded, so all 122 are live in
semantic search, and their character names ("Tomato Soup", "Apple Jelly") sit in
the character catalogue that title/character lookup reads.

This is the anthology-collapse failure already on record: a play row whose
source_url points at a volume containing something else entirely, then mined
wholesale. See memory `shared-source-url-collapse`.

Safe to delete: every FK into `monologues` is SET NULL or CASCADE, and these
rows have zero favourites, zero views, zero tapes — nobody has ever opened one.

The play row itself is kept (Love in a Wood is real and may be extracted
properly later) but its wrong source_url is cleared so a future extraction run
cannot re-mine the cookbook. A play with no monologues is invisible to search:
_load_catalogue only indexes plays that have them.

    python scripts/purge_miscextracted_play.py            # dry run
    python scripts/purge_miscextracted_play.py --apply     # backup + delete
    python scripts/purge_miscextracted_play.py --play 240  # target another row
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import SessionLocal  # noqa: E402
from sqlalchemy import text as sa_text  # noqa: E402

BACKUP_DIR = Path(__file__).resolve().parent.parent / "backups"
DEFAULT_PLAY_ID = 240


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    ap.add_argument("--play", type=int, default=DEFAULT_PLAY_ID, help="play id to purge")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        play = db.execute(
            sa_text("SELECT id, title, author, source_url FROM plays WHERE id = :p"),
            {"p": args.play},
        ).fetchone()
        if not play:
            print(f"No play with id {args.play}.")
            return 1

        print(f"Play {play[0]}: {play[1]!r} by {play[2]}")
        print(f"  source_url: {play[3]}\n")

        rows = db.execute(
            sa_text(
                "SELECT id, character_name, word_count, "
                "left(regexp_replace(text, '\\s+', ' ', 'g'), 90) AS snippet "
                "FROM monologues WHERE play_id = :p ORDER BY id"
            ),
            {"p": args.play},
        ).fetchall()

        if not rows:
            print("No monologues on this play. Nothing to do.")
            return 0

        print(f"{len(rows)} monologue(s) would be deleted. First 10:")
        for r in rows[:10]:
            print(f"  [{r[1]}] {r[3]}  ({r[2]}w)")
        if len(rows) > 10:
            print(f"  … and {len(rows) - 10} more")

        # Refuse to run if anyone has actually engaged with these — a purge is
        # only obviously safe while the rows are untouched.
        refs = 0
        for table in ("monologue_favorites", "monologue_views", "user_tapes"):
            refs += (
                db.execute(
                    sa_text(
                        f"SELECT count(*) FROM {table} WHERE monologue_id IN "
                        "(SELECT id FROM monologues WHERE play_id = :p)"
                    ),
                    {"p": args.play},
                ).scalar()
                or 0
            )
        print(f"\nUser references (favourites + views + tapes): {refs}")
        if refs:
            print("REFUSING: these pieces have user engagement. Review by hand.")
            return 1

        if not args.apply:
            print("\nDry run — nothing written. Re-run with --apply.")
            return 0

        BACKUP_DIR.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = BACKUP_DIR / f"purge_play_{args.play}_{stamp}.json"

        # Full rows, so the delete is reversible. Embeddings are excluded: they
        # are regenerable and would bloat the file past usefulness.
        full = db.execute(
            sa_text(
                "SELECT id, play_id, title, character_name, text, word_count, "
                "estimated_duration_seconds, character_gender, character_age_range, "
                "primary_emotion, tone, themes, difficulty_level "
                "FROM monologues WHERE play_id = :p"
            ),
            {"p": args.play},
        ).fetchall()
        backup_path.write_text(
            json.dumps(
                {
                    "play": {"id": play[0], "title": play[1], "author": play[2],
                             "source_url": play[3]},
                    "monologues": [dict(r._mapping) for r in full],
                },
                indent=2,
                default=str,
            )
        )
        print(f"\nBackup written: {backup_path}")

        deleted = db.execute(
            sa_text("DELETE FROM monologues WHERE play_id = :p"), {"p": args.play}
        ).rowcount
        db.execute(
            sa_text("UPDATE plays SET source_url = NULL WHERE id = :p"), {"p": args.play}
        )
        db.commit()
        print(f"Deleted {deleted} monologue(s); cleared the bad source_url on play {args.play}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
