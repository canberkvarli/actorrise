"""
Scrape public domain plays from Internet Archive (Archive.org).

LEGAL: Only scrapes plays published before 1928 (US public domain).
"""

import logging
import time
from typing import Dict, List, Optional

import internetarchive as ia
import requests
from sqlalchemy.orm import Session

from app.models.actor import Monologue, Play
from app.services.extraction.plain_text_parser import PlainTextParser
from app.utils.duration import estimate_duration_seconds
from app.utils.monologue_quality_guard import filter_monologues

logger = logging.getLogger(__name__)


class ArchiveOrgScraper:
    """Scrape public domain theater from Internet Archive."""

    # Only works published before 1928 are public domain in US
    PUBLIC_DOMAIN_YEAR = 1928

    def __init__(self, db: Session):
        self.db = db
        self.parser = PlainTextParser()

    def search_plays(
        self,
        additional_query: str = "",
        year_max: int = PUBLIC_DOMAIN_YEAR,
        limit: int = 100
    ) -> List[Dict]:
        """
        Search Internet Archive for public domain plays (English only).

        Args:
            additional_query: Additional search terms
            year_max: Maximum publication year (default: 1928 for public domain)
            limit: Max results to return

        Returns:
            List of play metadata dicts
        """
        # Search for drama/theater texts (English only)
        query = f"collection:americana AND mediatype:texts AND subject:drama AND language:eng AND year:[* TO {year_max}]"
        if additional_query:
            query += f" AND {additional_query}"

        logger.info(f"Searching Archive.org: {query}")

        try:
            search_results = ia.search_items(query)

            plays = []
            count = 0
            for result in search_results:
                if limit and count >= limit:
                    break
                count += 1
                try:
                    item = ia.get_item(result['identifier'])

                    # Filter for theatrical works (skip poetry, novels, criticism)
                    if not self._is_theatrical_work(item):
                        continue

                    # Filter for English language only
                    metadata = item.metadata
                    language = metadata.get('language', '').lower()
                    if language and 'eng' not in language and 'english' not in language:
                        logger.info(f"Skipping non-English item: {metadata.get('title', 'Unknown')} (language: {language})")
                        continue

                    plays.append({
                        'identifier': item.identifier,
                        'title': metadata.get('title', 'Unknown'),
                        'creator': metadata.get('creator', 'Unknown'),
                        'year': metadata.get('year'),
                        'date': metadata.get('date'),
                        'publisher': metadata.get('publisher'),
                        'url': f"https://archive.org/details/{item.identifier}",
                        'subjects': metadata.get('subject', [])
                    })

                except Exception as e:
                    logger.warning(f"Failed to process item {result.get('identifier')}: {e}")
                    continue

            logger.info(f"Found {len(plays)} theatrical works")
            return plays

        except Exception as e:
            logger.error(f"Archive.org search failed: {e}")
            return []

    def _is_theatrical_work(self, item) -> bool:
        """
        Check if item is a theatrical work (play, not poetry/novel).

        Args:
            item: Internet Archive item

        Returns:
            True if theatrical work
        """
        metadata = item.metadata
        subjects = metadata.get('subject', [])

        # Ensure subjects is a list
        if isinstance(subjects, str):
            subjects = [subjects]

        # Convert to lowercase for matching
        subjects_lower = [s.lower() if isinstance(s, str) else '' for s in subjects]

        # Positive indicators
        theater_keywords = [
            'drama', 'plays', 'theater', 'theatre', 'dramatic',
            'tragedy', 'comedy', 'tragicomedy', 'one-act'
        ]

        has_theater = any(keyword in ' '.join(subjects_lower) for keyword in theater_keywords)

        # Negative indicators (exclude these)
        exclude_keywords = [
            'poetry', 'poems', 'novel', 'fiction', 'prose',
            'criticism', 'biography', 'history', 'essay'
        ]

        has_exclude = any(keyword in ' '.join(subjects_lower) for keyword in exclude_keywords)

        title = metadata.get('title', '').lower()
        has_play_in_title = any(word in title for word in ['play', 'drama', 'comedy', 'tragedy'])

        return (has_theater or has_play_in_title) and not has_exclude

    def download_text(self, identifier: str) -> Optional[str]:
        """
        Download full text from Archive.org item.

        Args:
            identifier: Archive.org item identifier

        Returns:
            Full text or None if not available
        """
        try:
            item = ia.get_item(identifier)

            # Try to find text file (prefer .txt, fallback to .pdf OCR)
            text_file = None
            for file in item.files:
                filename = file.get('name', '')
                if filename.endswith('.txt') and '_djvu.txt' not in filename:
                    text_file = file
                    break

            if not text_file:
                logger.warning(f"No suitable text file for {identifier}")
                return None

            # Download text
            download_url = f"https://archive.org/download/{identifier}/{text_file['name']}"
            response = requests.get(download_url, timeout=30)
            response.raise_for_status()

            return response.text

        except Exception as e:
            logger.error(f"Failed to download text for {identifier}: {e}")
            return None

    def ingest_play(self, identifier: str) -> Optional[int]:
        """
        Download and ingest a play from Archive.org.

        Args:
            identifier: Archive.org item identifier

        Returns:
            Number of monologues extracted, or None if failed
        """
        try:
            item = ia.get_item(identifier)
            metadata = item.metadata

            title = metadata.get('title', 'Unknown')
            author = metadata.get('creator', 'Unknown')
            year = metadata.get('year')

            logger.info(f"Ingesting: {title} by {author}")

            # Check if already exists
            existing = self.db.query(Play).filter(
                Play.title == title,
                Play.author == author
            ).first()

            if existing:
                logger.info(f"Play already exists: {title}")
                return None

            # Download text
            text = self.download_text(identifier)
            if not text:
                return None

            # Extract year from date if year not set
            if not year and metadata.get('date'):
                try:
                    year = int(metadata.get('date', '').split('-')[0])
                except:
                    year = None

            # The shared pipeline, not a bespoke insert loop: quality gate, skip
            # list, duplicate check, metadata and embedding. Archive.org text is
            # OCR of scanned books, so it is the noisiest source we have and the
            # one that most needs the gate it was skipping.
            from app.services.ai.content_analyzer import ContentAnalyzer
            from app.services.ai.langchain.embeddings import generate_embeddings_batch
            from app.services.data_ingestion.pipeline import ingest_play

            report = ingest_play(
                self.db,
                title=title,
                author=author,
                full_text=text,
                copyright_status='public_domain',
                license_type='public_domain',
                source_url=f"https://archive.org/details/{identifier}",
                category='classical',
                genre='drama',
                apply=True,
                analyzer=ContentAnalyzer(),
                embed=generate_embeddings_batch,
            )

            if report.refused:
                logger.info("✗ %s: %s", title, report.refused)
                return 0

            if report.play_id:
                self.db.query(Play).filter(Play.id == report.play_id).update(
                    {
                        Play.full_text: text,
                        Play.text_format: 'plain',
                        Play.year_written: int(year) if year else None,
                        Play.publisher: metadata.get('publisher'),
                    },
                    synchronize_session=False,
                )
                self.db.commit()

            logger.info("✓ %s: %s", title, report.summary())
            return report.inserted

        except Exception as e:
            logger.error(f"Failed to ingest {identifier}: {e}")
            self.db.rollback()
            return None

    def ingest_batch(
        self,
        search_query: str = "",
        limit: int = 50,
        delay: float = 2.0
    ) -> Dict[str, int]:
        """
        Search and ingest a batch of plays from Archive.org.

        Args:
            search_query: Optional search term
            limit: Max plays to process
            delay: Delay between requests (rate limiting)

        Returns:
            Statistics dict
        """
        stats = {
            'searched': 0,
            'plays_added': 0,
            'monologues_added': 0,
            'skipped': 0,
            'failed': 0
        }

        # Search for plays
        plays = self.search_plays(additional_query=search_query, limit=limit)
        stats['searched'] = len(plays)

        logger.info(f"Processing {len(plays)} plays from Archive.org...")

        for play_info in plays:
            try:
                # Rate limiting
                time.sleep(delay)

                # Ingest
                count = self.ingest_play(play_info['identifier'])

                if count is None:
                    stats['skipped'] += 1
                elif count > 0:
                    stats['plays_added'] += 1
                    stats['monologues_added'] += count
                else:
                    stats['failed'] += 1

            except Exception as e:
                logger.error(f"Error processing {play_info['identifier']}: {e}")
                stats['failed'] += 1
                continue

        logger.info(f"Archive.org batch complete: {stats}")
        return stats
