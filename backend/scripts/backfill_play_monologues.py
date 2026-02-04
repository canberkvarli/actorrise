"""
Backfill monologues for plays that have full_text but no monologues.

Some plays (e.g. Hamlet) were ingested with full text but monologue extraction
didn't run or returned 0. This script re-runs extraction and inserts monologues.

Run from repo root:
    cd backend && uv run python scripts/backfill_play_monologues.py
    cd backend && uv run python scripts/backfill_play_monologues.py --play "Hamlet"
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Play, Monologue
from app.services.extraction.plain_text_parser import PlainTextParser


def backfill_play(db, play: Play, min_words: int = 50, max_words: int = 500) -> int:
    """Extract monologues from play.full_text and insert. Returns count inserted."""
    if not play.full_text or len(play.full_text.strip()) < 500:
        print(f"  ⚠️  Skipping {play.title}: no or too little full_text")
        return 0
    parser = PlainTextParser()
    monologues = parser.extract_monologues(
        play.full_text, min_words=min_words, max_words=max_words
    )
    if not monologues:
        print(f"  ⚠️  Parser found 0 monologues for {play.title}")
        return 0
    count = 0
    for mono in monologues:
        try:
            m = Monologue(
                play_id=play.id,
                title=f"{mono['character']}'s speech from {play.title}",
                character_name=mono["character"],
                text=mono["text"],
                stage_directions=mono.get("stage_directions"),
                word_count=mono["word_count"],
                estimated_duration_seconds=int(mono["word_count"] / 150 * 60),
            )
            db.add(m)
            count += 1
        except Exception as e:
            print(f"  ⚠️  Error inserting monologue: {e}")
    db.commit()
    return count


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Backfill monologues for plays with full_text")
    parser.add_argument("--play", type=str, help='Backfill only this play title (e.g. "Hamlet")')
    parser.add_argument("--all", action="store_true", help="Backfill all plays with full_text and 0 monologues")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.play:
            plays = db.query(Play).filter(Play.title.ilike(f"%{args.play}%")).all()
            if not plays:
                print(f'No play matching "{args.play}" found.')
                return
            for p in plays:
                existing = db.query(Monologue).filter(Monologue.play_id == p.id).count()
                if existing > 0:
                    print(f"  {p.title} already has {existing} monologues; skipping.")
                    continue
                print(f"Backfilling: {p.title} by {p.author}")
                n = backfill_play(db, p)
                print(f"  ✅ Inserted {n} monologues\n")
        elif args.all:
            # All plays that have full_text and 0 monologues
            plays_with_monologues = {
                r[0] for r in db.query(Monologue.play_id).distinct().all()
            }
            all_with_text = (
                db.query(Play)
                .filter(Play.full_text.isnot(None), Play.full_text != "")
                .all()
            )
            plays = [p for p in all_with_text if p.id not in plays_with_monologues]
            if not plays:
                print("No plays with full_text and 0 monologues found.")
                return
            print(f"Found {len(plays)} play(s) with full_text and 0 monologues.\n")
            for p in plays:
                print(f"Backfilling: {p.title} by {p.author}")
                n = backfill_play(db, p)
                print(f"  ✅ Inserted {n} monologues\n")
        else:
            parser.print_help()
            print('\nExample: uv run python scripts/backfill_play_monologues.py --play "Hamlet"')
    finally:
        db.close()


if __name__ == "__main__":
    main()
