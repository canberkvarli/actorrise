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
from typing import Optional

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
from app.services.extraction.plain_text_parser import PlainTextParser
from app.services.extraction.tei_xml_parser import TEIXMLParser
from app.models.actor import Play, Monologue

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
    Scrape Wikisource public domain plays and extract monologues.

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
    parser = PlainTextParser()

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
                year = play_data.get('year')

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

                # Create Play record
                play = Play(
                    title=title,
                    author=author,
                    year_written=year,
                    genre='drama',
                    category='classical',
                    copyright_status='public_domain',
                    source_url=play_data.get('url'),
                    full_text=text,
                    text_format='plain',
                    language='en'
                )

                db.add(play)
                db.commit()

                logger.info(f"  ✅ Created play record (ID: {play.id})")
                stats['plays_added'] += 1

                # Extract monologues
                logger.info(f"  🔍 Extracting monologues...")
                monologues = parser.extract_monologues(text, min_words=50, max_words=500)

                logger.info(f"  📝 Found {len(monologues)} potential monologues")

                # Save monologues
                for mono in monologues:
                    try:
                        monologue = Monologue(
                            play_id=play.id,
                            title=f"{mono['character']}'s speech from {title}",
                            character_name=mono['character'],
                            text=mono['text'],
                            stage_directions=mono.get('stage_directions'),
                            word_count=mono['word_count'],
                            estimated_duration_seconds=int(mono['word_count'] / 150 * 60)  # 150 wpm
                        )
                        db.add(monologue)
                        stats['monologues_added'] += 1

                    except Exception as e:
                        logger.error(f"  ⚠️  Error creating monologue: {e}")
                        continue

                db.commit()
                logger.info(f"  ✓ Added {len(monologues)} monologues")

                time.sleep(1)  # Rate limit

            except Exception as e:
                logger.error(f"  ✗ Error processing {play_data.get('title', 'Unknown')}: {e}")
                stats['failed'] += 1
                db.rollback()
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

    return stats


def scrape_perseus(db, limit: int = 50) -> dict:
    """
    Scrape Perseus Digital Library classical drama from local repos.

    Args:
        db: Database session
        limit: Max plays to process

    Returns:
        Statistics dict

    Note: Expects Perseus repos at backend/data/perseus/
          If not found, will log warning and skip.
    """
    logger.info("\n" + "=" * 60)
    logger.info("PHASE 4: Perseus Digital Library")
    logger.info("=" * 60)

    scraper = PerseusScraper()
    dedup = MonologueDeduplicator(db)
    tei_parser = TEIXMLParser()

    stats = {
        'searched': 0,
        'plays_added': 0,
        'monologues_added': 0,
        'duplicates_skipped': 0,
        'failed': 0
    }

    # Check for local Perseus repos
    repo_base = Path(backend_dir) / "data" / "perseus"

    if not repo_base.exists():
        logger.warning("⚠️  Perseus repos not found at backend/data/perseus/")
        logger.info("   Clone repos to enable Perseus scraping:")
        logger.info("   git clone https://github.com/PerseusDL/canonical-greekLit.git")
        logger.info("   git clone https://github.com/PerseusDL/canonical-latinLit.git")
        return stats

    logger.info(f"Scanning Perseus repos at {repo_base}...")

    try:
        # Scan local repos for English TEI XML files
        tei_files = scraper.scan_local_repos(str(repo_base))
        stats['searched'] = len(tei_files)

        logger.info(f"Found {len(tei_files)} English TEI XML files")

        for file_data in tei_files[:limit]:
            try:
                file_path = file_data['file_path']
                tradition = file_data['tradition']

                # Read TEI XML content
                xml_content = scraper.read_tei_xml(file_path)

                if not xml_content:
                    logger.warning(f"  ✗ Could not read: {file_path}")
                    stats['failed'] += 1
                    continue

                # Extract metadata from TEI header
                metadata = tei_parser.extract_play_metadata(xml_content)
                title = metadata.get('title', 'Unknown')
                author = metadata.get('author', 'Unknown')
                year = metadata.get('year')

                # Check for duplicates
                if dedup.is_duplicate_play(title, author):
                    logger.info(f"  ⊘ Skipping duplicate: {title} by {author}")
                    stats['duplicates_skipped'] += 1
                    continue

                logger.info(f"  → {author} - {title} ({tradition})")

                # Create play record
                play = Play(
                    title=title,
                    author=author,
                    year_written=year,
                    genre='tragedy',  # Most classical plays are tragedies
                    category='classical',
                    copyright_status='public_domain',
                    source_url=f"https://github.com/PerseusDL/canonical-{tradition}Lit",
                    full_text=xml_content,
                    text_format='tei_xml',
                    language='en'
                )

                db.add(play)
                db.commit()

                logger.info(f"  ✅ Created play record (ID: {play.id})")
                stats['plays_added'] += 1

                # Extract monologues using TEI parser
                logger.info(f"  🔍 Extracting monologues from TEI XML...")
                monologues = tei_parser.extract_monologues(xml_content, min_words=50, max_words=500)

                logger.info(f"  📝 Found {len(monologues)} potential monologues")

                # Save monologues
                for mono in monologues:
                    try:
                        monologue = Monologue(
                            play_id=play.id,
                            title=f"{mono['character']}'s speech from {title}",
                            character_name=mono['character'],
                            text=mono['text'],
                            stage_directions=mono.get('stage_directions'),
                            word_count=mono['word_count'],
                            estimated_duration_seconds=int(mono['word_count'] / 150 * 60)  # 150 wpm
                        )
                        db.add(monologue)
                        stats['monologues_added'] += 1

                    except Exception as e:
                        logger.error(f"  ⚠️  Error creating monologue: {e}")
                        continue

                db.commit()
                logger.info(f"  ✓ Added {len(monologues)} monologues")

            except Exception as e:
                logger.error(f"  ✗ Error processing {file_data.get('file_path', 'Unknown')}: {e}")
                stats['failed'] += 1
                db.rollback()
                continue

    except Exception as e:
        logger.error(f"Error scanning Perseus repos: {e}")

    logger.info("\n" + "=" * 60)
    logger.info("Perseus Summary:")
    logger.info(f"  Plays cataloged: {stats['searched']}")
    logger.info(f"  Plays added: {stats['plays_added']}")
    logger.info(f"  Monologues added: {stats['monologues_added']}")
    logger.info(f"  Duplicates skipped: {stats['duplicates_skipped']}")
    logger.info(f"  Failed: {stats['failed']}")
    logger.info("=" * 60)

    if stats['plays_added'] > 0 and stats['monologues_added'] == 0:
        logger.info("📋 Next Step: Clone Perseus GitHub repos for full text extraction:")
        logger.info("   git clone https://github.com/PerseusDL/canonical-greekLit.git")
        logger.info("   git clone https://github.com/PerseusDL/canonical-latinLit.git")
        logger.info("   Then parse TEI XML files using TEIXMLParser")

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
