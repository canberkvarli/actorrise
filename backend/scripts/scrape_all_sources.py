#!/usr/bin/env python
"""
Master script to scrape all legal monologue sources.

Orchestrates:
1. Project Gutenberg - Classical plays (pre-1928)
2. Archive.org - Public domain theater
3. Wikisource - Community-verified plays
4. Perseus Digital Library - Classical Greek/Roman drama
5. Deduplication
6. Stats reporting

Usage:
    uv run python scripts/scrape_all_sources.py

Options:
    --gutenberg-only: Only scrape Gutenberg
    --archive-only: Only scrape Archive.org
    --wikisource-only: Only scrape Wikisource
    --perseus-only: Only scrape Perseus
    --limit N: Limit results per source (default: 50)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.services.data_ingestion.gutenberg_scraper import (
    CLASSICAL_PLAYWRIGHTS,
    GutenbergScraper,
)
from app.services.data_ingestion.archive_org_scraper import ArchiveOrgScraper
from app.services.data_ingestion.wikisource_scraper import WikisourceScraper
from app.services.data_ingestion.perseus_scraper import PerseusScraper
from app.services.data_ingestion.deduplicator import MonologueDeduplicator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def scrape_gutenberg(db, limit_per_author: int = 5) -> dict:
    """
    Scrape expanded Gutenberg collection.

    Args:
        db: Database session
        limit_per_author: Max plays per playwright

    Returns:
        Statistics dict
    """
    logger.info("=" * 60)
    logger.info("PHASE 1: Project Gutenberg")
    logger.info("=" * 60)

    scraper = GutenbergScraper(db)
    dedup = MonologueDeduplicator(db)

    stats = {
        'authors_processed': 0,
        'plays_searched': 0,
        'plays_added': 0,
        'monologues_added': 0,
        'duplicates_skipped': 0
    }

    for author, plays in CLASSICAL_PLAYWRIGHTS.items():
        logger.info(f"\n--- {author} ---")
        stats['authors_processed'] += 1

        # Limit plays per author to avoid overwhelming the system
        for play_title in plays[:limit_per_author]:
            try:
                stats['plays_searched'] += 1

                # Check if play already exists
                if dedup.is_duplicate_play(play_title, author):
                    logger.info(f"  ⊘ Skipping duplicate: {play_title}")
                    stats['duplicates_skipped'] += 1
                    continue

                # Search Gutenberg
                results = scraper.search_plays(author, play_title)

                if not results:
                    logger.info(f"  ✗ Not found: {play_title}")
                    continue

                # Take first match
                book = results[0]
                logger.info(f"  → Found: {play_title} (ID: {book['id']})")

                # Download and ingest
                count = scraper.ingest_play(book['id'], author, play_title)

                if count:
                    stats['plays_added'] += 1
                    stats['monologues_added'] += count
                    logger.info(f"  ✓ Extracted {count} monologues")

                # Rate limit: don't hammer Gutenberg
                time.sleep(1)

            except Exception as e:
                logger.error(f"  ✗ Error with {play_title}: {e}")
                continue

    logger.info("\n" + "=" * 60)
    logger.info("Gutenberg Summary:")
    logger.info(f"  Authors: {stats['authors_processed']}")
    logger.info(f"  Plays searched: {stats['plays_searched']}")
    logger.info(f"  Plays added: {stats['plays_added']}")
    logger.info(f"  Monologues added: {stats['monologues_added']}")
    logger.info(f"  Duplicates skipped: {stats['duplicates_skipped']}")
    logger.info("=" * 60)

    return stats


def scrape_archive_org(db, limit: int = 50) -> dict:
    """
    Scrape Archive.org public domain theater.

    Args:
        db: Database session
        limit: Max items to process

    Returns:
        Statistics dict
    """
    logger.info("\n" + "=" * 60)
    logger.info("PHASE 2: Internet Archive")
    logger.info("=" * 60)

    scraper = ArchiveOrgScraper(db)

    # Search with different queries to get variety
    queries = [
        "",  # General drama search
        "american",  # American theater
        "comedy",  # Comedies
        "tragedy",  # Tragedies
    ]

    total_stats = {
        'searched': 0,
        'plays_added': 0,
        'monologues_added': 0,
        'skipped': 0,
        'failed': 0
    }

    for query in queries:
        logger.info(f"\nSearching: {query or 'all drama'}")

        stats = scraper.ingest_batch(
            search_query=query,
            limit=limit // len(queries),  # Split limit across queries
            delay=2.0  # Rate limit
        )

        # Aggregate stats
        for key in total_stats:
            total_stats[key] += stats.get(key, 0)

    logger.info("\n" + "=" * 60)
    logger.info("Archive.org Summary:")
    logger.info(f"  Items searched: {total_stats['searched']}")
    logger.info(f"  Plays added: {total_stats['plays_added']}")
    logger.info(f"  Monologues added: {total_stats['monologues_added']}")
    logger.info(f"  Skipped: {total_stats['skipped']}")
    logger.info(f"  Failed: {total_stats['failed']}")
    logger.info("=" * 60)

    return total_stats


def scrape_wikisource(db, limit: int = 50) -> dict:
    """
    Scrape Wikisource public domain plays.

    Args:
        db: Database session
        limit: Max plays to process

    Returns:
        Statistics dict
    """
    logger.info("\n" + "=" * 60)
    logger.info("PHASE 3: Wikisource")
    logger.info("=" * 60)

    scraper = WikisourceScraper()
    dedup = MonologueDeduplicator(db)

    stats = {
        'searched': 0,
        'plays_added': 0,
        'monologues_added': 0,
        'duplicates_skipped': 0,
        'failed': 0
    }

    # Search main Plays category
    logger.info(f"Searching Wikisource 'Plays' category (limit={limit})...")

    try:
        plays = scraper.search_plays(category="Plays", limit=limit)
        stats['searched'] = len(plays)

        for play_data in plays:
            try:
                title = play_data['title']
                author = play_data.get('author', 'Unknown')

                # Check for duplicates
                if dedup.is_duplicate_play(title, author):
                    logger.info(f"  ⊘ Skipping duplicate: {title}")
                    stats['duplicates_skipped'] += 1
                    continue

                # Fetch full text
                logger.info(f"  → Fetching: {title} by {author}")
                text = scraper.fetch_play_text(title)

                if not text or len(text) < 500:
                    logger.info(f"  ✗ Text too short or unavailable: {title}")
                    stats['failed'] += 1
                    continue

                # TODO: Parse play text and extract monologues
                # For now, just log that we got the text
                # In production, integrate with PlainTextParser or similar
                logger.info(f"  ✓ Retrieved {len(text)} chars for {title}")
                # stats['plays_added'] += 1
                # stats['monologues_added'] += count

                time.sleep(1)  # Rate limit

            except Exception as e:
                logger.error(f"  ✗ Error processing {play_data.get('title', 'Unknown')}: {e}")
                stats['failed'] += 1
                continue

    except Exception as e:
        logger.error(f"Error searching Wikisource: {e}")

    logger.info("\n" + "=" * 60)
    logger.info("Wikisource Summary:")
    logger.info(f"  Plays searched: {stats['searched']}")
    logger.info(f"  Plays added: {stats['plays_added']}")
    logger.info(f"  Monologues added: {stats['monologues_added']}")
    logger.info(f"  Duplicates skipped: {stats['duplicates_skipped']}")
    logger.info(f"  Failed: {stats['failed']}")
    logger.info("=" * 60)
    logger.info("Note: Wikisource integration requires play text parser implementation")

    return stats


def scrape_perseus(db, limit: int = 50) -> dict:
    """
    Scrape Perseus Digital Library classical drama.

    Args:
        db: Database session
        limit: Max plays to process (Perseus has curated list, so limit may not apply)

    Returns:
        Statistics dict
    """
    logger.info("\n" + "=" * 60)
    logger.info("PHASE 4: Perseus Digital Library")
    logger.info("=" * 60)

    scraper = PerseusScraper()
    dedup = MonologueDeduplicator(db)

    stats = {
        'searched': 0,
        'plays_added': 0,
        'monologues_added': 0,
        'duplicates_skipped': 0,
        'failed': 0
    }

    logger.info("Fetching classical Greek and Roman plays...")

    try:
        # Get all classical plays (English translations)
        plays = scraper.get_classical_plays(language='en')
        stats['searched'] = len(plays)

        logger.info(f"Found {len(plays)} classical plays")

        for play_data in plays[:limit]:
            try:
                title = play_data['title']
                author = play_data['author']
                tradition = play_data.get('tradition', 'Classical')

                # Check for duplicates
                if dedup.is_duplicate_play(title, author):
                    logger.info(f"  ⊘ Skipping duplicate: {title} by {author}")
                    stats['duplicates_skipped'] += 1
                    continue

                logger.info(f"  → {author} - {title} ({tradition})")

                # TODO: Fetch full text using CTS URN or GitHub canonical repos
                # For now, we have metadata but need text integration
                # In production: integrate with canonical-greekLit/latinLit repos
                # stats['plays_added'] += 1
                # stats['monologues_added'] += count

            except Exception as e:
                logger.error(f"  ✗ Error processing {play_data.get('title', 'Unknown')}: {e}")
                stats['failed'] += 1
                continue

    except Exception as e:
        logger.error(f"Error fetching Perseus plays: {e}")

    logger.info("\n" + "=" * 60)
    logger.info("Perseus Summary:")
    logger.info(f"  Plays cataloged: {stats['searched']}")
    logger.info(f"  Plays added: {stats['plays_added']}")
    logger.info(f"  Monologues added: {stats['monologues_added']}")
    logger.info(f"  Duplicates skipped: {stats['duplicates_skipped']}")
    logger.info(f"  Failed: {stats['failed']}")
    logger.info("=" * 60)
    logger.info("Note: Perseus integration requires CTS URN text fetching or GitHub repo integration")
    logger.info("      Consider cloning canonical-greekLit/latinLit repos for full text access")

    return stats


def main():
    """Main orchestration function."""
    parser = argparse.ArgumentParser(description="Scrape all monologue sources")
    parser.add_argument(
        '--gutenberg-only',
        action='store_true',
        help='Only scrape Project Gutenberg'
    )
    parser.add_argument(
        '--archive-only',
        action='store_true',
        help='Only scrape Archive.org'
    )
    parser.add_argument(
        '--wikisource-only',
        action='store_true',
        help='Only scrape Wikisource'
    )
    parser.add_argument(
        '--perseus-only',
        action='store_true',
        help='Only scrape Perseus Digital Library'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=50,
        help='Limit results per source (default: 50)'
    )

    args = parser.parse_args()

    # Start timer
    start_time = time.time()

    logger.info("=" * 60)
    logger.info("🎭 ACTORRISE MONOLOGUE SCRAPER")
    logger.info("=" * 60)
    logger.info(f"Limit per source: {args.limit}")
    logger.info("Legal: Public domain only (pre-1928)")
    logger.info("=" * 60)

    # Create database session
    db = SessionLocal()

    try:
        grand_total = {
            'plays_added': 0,
            'monologues_added': 0,
            'duplicates_skipped': 0
        }

        # Check if running specific source only
        only_flags = [args.gutenberg_only, args.archive_only, args.wikisource_only, args.perseus_only]
        run_all = not any(only_flags)

        # Phase 1: Gutenberg
        if args.gutenberg_only or run_all:
            gutenberg_stats = scrape_gutenberg(db, limit_per_author=5)
            grand_total['plays_added'] += gutenberg_stats['plays_added']
            grand_total['monologues_added'] += gutenberg_stats['monologues_added']
            grand_total['duplicates_skipped'] += gutenberg_stats['duplicates_skipped']

        # Phase 2: Archive.org
        if args.archive_only or run_all:
            archive_stats = scrape_archive_org(db, limit=args.limit)
            grand_total['plays_added'] += archive_stats['plays_added']
            grand_total['monologues_added'] += archive_stats['monologues_added']
            grand_total['duplicates_skipped'] += archive_stats.get('skipped', 0)

        # Phase 3: Wikisource
        if args.wikisource_only or run_all:
            wikisource_stats = scrape_wikisource(db, limit=args.limit)
            grand_total['plays_added'] += wikisource_stats['plays_added']
            grand_total['monologues_added'] += wikisource_stats['monologues_added']
            grand_total['duplicates_skipped'] += wikisource_stats.get('duplicates_skipped', 0)

        # Phase 4: Perseus
        if args.perseus_only or run_all:
            perseus_stats = scrape_perseus(db, limit=args.limit)
            grand_total['plays_added'] += perseus_stats['plays_added']
            grand_total['monologues_added'] += perseus_stats['monologues_added']
            grand_total['duplicates_skipped'] += perseus_stats.get('duplicates_skipped', 0)

        # Final summary
        elapsed = time.time() - start_time

        logger.info("\n" + "=" * 60)
        logger.info("🎉 SCRAPING COMPLETE!")
        logger.info("=" * 60)
        logger.info(f"✓ Total plays added: {grand_total['plays_added']}")
        logger.info(f"✓ Total monologues added: {grand_total['monologues_added']}")
        logger.info(f"⊘ Duplicates skipped: {grand_total['duplicates_skipped']}")
        logger.info(f"⏱  Time elapsed: {elapsed/60:.1f} minutes")
        logger.info("=" * 60)

        logger.info("\nNext steps:")
        logger.info("  1. Run AI enrichment: uv run python scripts/enrich_monologues.py")
        logger.info("  2. Verify search works: Test search for new monologues")
        logger.info("  3. Monitor: Check database size and performance")

    except KeyboardInterrupt:
        logger.warning("\n⚠️  Scraping interrupted by user")
        db.close()
        sys.exit(1)

    except Exception as e:
        logger.error(f"\n❌ Fatal error: {e}", exc_info=True)
        db.close()
        sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    main()
