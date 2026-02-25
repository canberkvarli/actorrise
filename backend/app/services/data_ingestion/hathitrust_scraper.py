"""
HathiTrust Digital Library scraper for public domain plays.

Legal status: All retrieved content is verified public domain by HathiTrust.
Language: English-language filtering via metadata.
API: HathiTrust Data API with respectful rate limiting.

Note: Bulk download requires Research Center agreement. This scraper uses
the public API for metadata and links to public domain works.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


class HathiTrustScraper:
    """
    Scraper for public domain plays from HathiTrust Digital Library.

    HathiTrust provides verified public domain status and high-quality OCR.
    All content is legally available and academically cataloged.
    """

    # HathiTrust API endpoints
    BIBLIOGRAPHIC_API = "https://catalog.hathitrust.org/api/volumes/brief"
    DATA_API = "https://data.analytics.hathitrust.org/genre"

    # Search via catalog (public interface - respectful scraping)
    CATALOG_SEARCH = "https://catalog.hathitrust.org/Search/Home"

    RATE_LIMIT_DELAY = 2.0  # 2 seconds between requests (respectful scraping)

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'ActorRise/1.0 (https://actorrise.com; legal public domain scraper)'
        })

    def search_plays(
        self,
        query: str = "drama OR plays OR theater",
        year_max: int = 1928,
        limit: int = 100
    ) -> List[Dict]:
        """
        Search for public domain plays.

        Args:
            query: Search terms
            year_max: Maximum publication year (default 1928 for public domain)
            limit: Maximum number of results

        Returns:
            List of play metadata dicts
        """
        plays = []

        logger.info(f"Searching HathiTrust for plays (query='{query}', year_max={year_max}, limit={limit})...")

        # Note: HathiTrust doesn't have a simple REST API for search.
        # For production use, you would:
        # 1. Apply for HathiTrust Research Center access
        # 2. Use the Solr API: https://solr2.babel.hathitrust.org/
        # 3. Or download bulk metadata files
        #
        # This implementation shows the structure for when API access is granted.

        logger.warning(
            "HathiTrust scraper requires Research Center access or API credentials. "
            "This is a placeholder implementation showing the expected structure."
        )

        # Placeholder for actual API implementation
        # When you have API access, use the Solr endpoint:
        # https://solr2.babel.hathitrust.org/solr/catalog/select?q=...

        return plays

    def fetch_bibliographic_data(self, htid: str) -> Optional[Dict]:
        """
        Fetch bibliographic metadata for a HathiTrust item.

        Args:
            htid: HathiTrust ID (e.g., "mdp.39015012345678")

        Returns:
            Bibliographic metadata dict or None
        """
        url = f"{self.BIBLIOGRAPHIC_API}/{htid}.json"

        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()

            time.sleep(self.RATE_LIMIT_DELAY)

            # Parse HathiTrust response
            items = data.get('items', [])
            if not items:
                return None

            item = items[0]

            # Extract metadata
            title = item.get('title', '')
            author = item.get('author', '')
            year = item.get('publishDate', '')

            # Get rights info
            rights = item.get('rights', '')
            is_public_domain = 'pd' in rights.lower() or 'public' in rights.lower()

            if not is_public_domain:
                logger.info(f"Skipping non-public-domain item: {htid}")
                return None

            # Get language
            language = item.get('language', '').lower()
            if language and 'eng' not in language and 'english' not in language:
                logger.info(f"Skipping non-English item: {htid} (language: {language})")
                return None

            return {
                'htid': htid,
                'title': title,
                'author': author,
                'year': self._parse_year(year),
                'url': f"https://babel.hathitrust.org/cgi/pt?id={htid}",
                'rights': rights,
                'source': 'hathitrust',
                'copyright_status': 'public_domain',
                'language': 'en'
            }

        except requests.RequestException as e:
            logger.error(f"Error fetching HathiTrust item {htid}: {e}")
            return None

    def _parse_year(self, year_str: str) -> Optional[int]:
        """Parse year from various formats."""
        if not year_str:
            return None

        # Extract first 4-digit year
        import re
        match = re.search(r'\d{4}', str(year_str))
        if match:
            try:
                return int(match.group())
            except ValueError:
                pass

        return None

    def get_public_domain_collections(self) -> List[Dict]:
        """
        Get known public domain theater collections in HathiTrust.

        Returns list of collection metadata for manual exploration.
        """
        # These are known public domain drama collections in HathiTrust
        # Curated list for bootstrapping the database
        collections = [
            {
                'name': 'American Drama Collection',
                'description': 'Public domain American plays pre-1928',
                'search_query': 'drama AND language:eng AND rights:pd AND publishDate:[* TO 1928]'
            },
            {
                'name': 'British Theatre Collection',
                'description': 'Public domain British plays',
                'search_query': 'theatre AND language:eng AND rights:pd AND publishDate:[* TO 1928]'
            },
            {
                'name': 'Classical Drama',
                'description': 'Greek and Roman drama in English translation',
                'search_query': '(Greek OR Roman) AND (drama OR tragedy OR comedy) AND language:eng AND rights:pd'
            },
            {
                'name': 'European Drama in Translation',
                'description': 'European plays translated to English',
                'search_query': 'drama AND language:eng AND rights:pd AND (French OR German OR Russian OR Italian)'
            },
            {
                'name': 'Shakespeare and Early Modern',
                'description': 'Shakespeare and contemporaries',
                'search_query': '(Shakespeare OR Marlowe OR Jonson OR Webster) AND rights:pd'
            }
        ]

        return collections

    def search_by_author(
        self,
        author: str,
        year_max: int = 1928
    ) -> List[Dict]:
        """
        Search for plays by a specific author.

        Args:
            author: Author name
            year_max: Maximum publication year

        Returns:
            List of play metadata
        """
        logger.info(f"Searching HathiTrust for plays by {author}...")

        # Placeholder - requires Solr API access
        logger.warning(
            "HathiTrust author search requires API credentials. "
            "Apply for Research Center access at: "
            "https://www.hathitrust.org/data_research_center"
        )

        return []

    def get_full_text_url(self, htid: str) -> str:
        """
        Get URL for full text view of a HathiTrust item.

        Args:
            htid: HathiTrust ID

        Returns:
            URL to full text page reader
        """
        return f"https://babel.hathitrust.org/cgi/pt?id={htid}"

    def get_download_url(self, htid: str) -> Optional[str]:
        """
        Get download URL for public domain text.

        Args:
            htid: HathiTrust ID

        Returns:
            Download URL or None if not available
        """
        # HathiTrust provides bulk downloads for public domain works
        # Format: https://babel.hathitrust.org/cgi/imgsrv/download/pdf?id=htid
        return f"https://babel.hathitrust.org/cgi/imgsrv/download/pdf?id={htid}"


# Example usage and integration guide
"""
To use this scraper in production:

1. Apply for HathiTrust Research Center access (free for non-commercial research):
   https://www.hathitrust.org/data_research_center

2. Get API credentials or download bulk metadata:
   - Solr API: https://solr2.babel.hathitrust.org/
   - Bulk metadata: https://www.hathitrust.org/hathifiles

3. Update search_plays() to use actual API:

   def search_plays(self, query, year_max, limit):
       solr_url = "https://solr2.babel.hathitrust.org/solr/catalog/select"
       params = {
           'q': f'{query} AND publishDate:[* TO {year_max}] AND language:eng AND rights:pd',
           'fl': 'id,title,author,publishDate,rights,language',
           'rows': limit,
           'wt': 'json'
       }
       response = self.session.get(solr_url, params=params)
       data = response.json()
       # Parse Solr response...

4. Implement text extraction from PDFs or use HathiTrust's text API

5. Respect rate limits and terms of service
"""
