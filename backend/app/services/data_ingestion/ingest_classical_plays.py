"""CLI script to ingest classical plays from Project Gutenberg."""

import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..')))

from app.core.database import SessionLocal
from app.services.data_ingestion.gutenberg_scraper import (
    CLASSICAL_PLAYWRIGHTS, GutenbergScraper)


def ingest_all_classical_plays():
    """Ingest all classical plays from Project Gutenberg"""

    db = SessionLocal()

    try:
        scraper = GutenbergScraper(db)

        total_stats = {
            'total_authors': len(CLASSICAL_PLAYWRIGHTS),
            'total_plays_found': 0,
            'total_plays_ingested': 0,
            'total_monologues': 0
        }

        for author, plays in CLASSICAL_PLAYWRIGHTS.items():
            stats = scraper.ingest_author_plays(
                author=author,
                play_titles=plays,
                genre="drama"
            )

            total_stats['total_plays_found'] += stats['plays_found']
            total_stats['total_plays_ingested'] += stats['plays_ingested']
            total_stats['total_monologues'] += stats['total_monologues']

        # Print final summary
        print(f"\n\n{'='*70}")
        print(f"🎭 FINAL SUMMARY - Classical Play Ingestion Complete")
        print(f"{'='*70}")
        print(f"Authors processed: {total_stats['total_authors']}")
        print(f"Plays found: {total_stats['total_plays_found']}")
        print(f"Plays ingested: {total_stats['total_plays_ingested']}")
        print(f"Total monologues extracted: {total_stats['total_monologues']}")
        print(f"{'='*70}\n")

    except Exception as e:
        print(f"Error during ingestion: {e}")
        import traceback
        traceback.print_exc()

    finally:
        db.close()


def ingest_specific_author(author_name: str):
    """Ingest plays from a specific author"""

    if author_name not in CLASSICAL_PLAYWRIGHTS:
        print(f"❌ Author '{author_name}' not found in classical playwrights list.")
        print(f"\nAvailable authors:")
        for author in CLASSICAL_PLAYWRIGHTS.keys():
            print(f"  - {author}")
        return

    db = SessionLocal()

    try:
        scraper = GutenbergScraper(db)
        plays = CLASSICAL_PLAYWRIGHTS[author_name]

        stats = scraper.ingest_author_plays(
            author=author_name,
            play_titles=plays,
            genre="drama"
        )

        print(f"\n✅ Completed ingestion for {author_name}")
        print(f"   Plays found: {stats['plays_found']}")
        print(f"   Plays ingested: {stats['plays_ingested']}")
        print(f"   Total monologues: {stats['total_monologues']}\n")

    except Exception as e:
        print(f"Error during ingestion: {e}")
        import traceback
        traceback.print_exc()

    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest classical plays from Project Gutenberg")
    parser.add_argument(
        '--author',
        type=str,
        help='Ingest plays from a specific author (e.g., "William Shakespeare")'
    )
    parser.add_argument(
        '--all',
        action='store_true',
        help='Ingest all classical plays (warning: this will take a long time!)'
    )

    args = parser.parse_args()

    if args.all:
        print("\n⚠️  WARNING: This will ingest ALL classical plays from Project Gutenberg.")
        print("   This process may take several hours.\n")
        confirm = input("Continue? (yes/no): ")

        if confirm.lower() in ['yes', 'y']:
            ingest_all_classical_plays()
        else:
            print("Cancelled.")

    elif args.author:
        ingest_specific_author(args.author)

    else:
        print("Usage:")
        print("  python -m app.services.data_ingestion.ingest_classical_plays --author \"William Shakespeare\"")
        print("  python -m app.services.data_ingestion.ingest_classical_plays --all")
        print("\nAvailable authors:")
        for author in CLASSICAL_PLAYWRIGHTS.keys():
            print(f"  - {author}")
