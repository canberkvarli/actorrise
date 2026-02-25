"""
Wikisource scraper for public domain plays.

Legal status: All content on Wikisource is public domain or freely licensed.
Language: English Wikisource subdomain (en.wikisource.org) ensures English-only content.
API: MediaWiki API with respectful rate limiting.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


class WikisourceScraper:
    """
    Scraper for public domain plays from Wikisource.

    Uses MediaWiki API to fetch plays from the English Wikisource.
    All content is public domain or freely licensed (CC-BY-SA).
    """

    BASE_URL = "https://en.wikisource.org/w/api.php"
    RATE_LIMIT_DELAY = 1.0  # 1 second between requests (respectful scraping)

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'ActorRise/1.0 (https://actorrise.com; legal public domain scraper)'
        })

    def search_plays(
        self,
        category: str = "Plays",
        limit: int = 100
    ) -> List[Dict]:
        """
        Search for plays in a specific category.

        Args:
            category: Wikisource category to search (default: "Plays")
            limit: Maximum number of plays to return

        Returns:
            List of play metadata dicts with keys: title, author, url, year
        """
        plays = []
        continue_token = None

        logger.info(f"Searching Wikisource category '{category}' for plays (limit={limit})...")

        while len(plays) < limit:
            params = {
                'action': 'query',
                'list': 'categorymembers',
                'cmtitle': f'Category:{category}',
                'cmlimit': min(50, limit - len(plays)),  # API max is 50 per request
                'format': 'json',
                'cmprop': 'title|timestamp'
            }

            if continue_token:
                params['cmcontinue'] = continue_token

            try:
                response = self.session.get(self.BASE_URL, params=params, timeout=10)
                response.raise_for_status()
                data = response.json()

                members = data.get('query', {}).get('categorymembers', [])

                for member in members:
                    title = member.get('title', '')

                    # Skip category pages and non-play entries
                    if title.startswith('Category:') or title.startswith('Portal:'):
                        continue

                    # Fetch page details
                    play_data = self._fetch_play_details(title)
                    if play_data:
                        plays.append(play_data)

                    if len(plays) >= limit:
                        break

                    time.sleep(self.RATE_LIMIT_DELAY)

                # Check for continuation
                continue_token = data.get('continue', {}).get('cmcontinue')
                if not continue_token or len(plays) >= limit:
                    break

            except requests.RequestException as e:
                logger.error(f"Error fetching Wikisource category '{category}': {e}")
                break

        logger.info(f"Found {len(plays)} plays from Wikisource category '{category}'")
        return plays[:limit]

    def _fetch_play_details(self, title: str) -> Optional[Dict]:
        """
        Fetch detailed metadata for a specific play.

        Args:
            title: Page title on Wikisource

        Returns:
            Dict with play metadata or None if fetch fails
        """
        params = {
            'action': 'query',
            'titles': title,
            'prop': 'revisions|info',
            'rvprop': 'content',
            'rvslots': 'main',
            'format': 'json',
            'inprop': 'url'
        }

        try:
            response = self.session.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            pages = data.get('query', {}).get('pages', {})

            # Get first (and only) page
            page_id = list(pages.keys())[0]
            if page_id == '-1':
                logger.warning(f"Page not found: {title}")
                return None

            page = pages[page_id]

            # Extract metadata
            page_title = page.get('title', '')
            page_url = page.get('fullurl', '')

            # Try to extract author and year from title or content
            # Format is often "Title (Author)" or "Title/Author"
            author = self._extract_author(page_title, page.get('revisions', [{}])[0])
            year = self._extract_year(page.get('revisions', [{}])[0])

            return {
                'title': page_title,
                'author': author,
                'url': page_url,
                'year': year,
                'source': 'wikisource',
                'copyright_status': 'public_domain',
                'language': 'en'
            }

        except (requests.RequestException, KeyError, IndexError) as e:
            logger.error(f"Error fetching details for '{title}': {e}")
            return None

    def fetch_play_text(self, title: str) -> Optional[str]:
        """
        Fetch full text of a play.

        Args:
            title: Page title on Wikisource

        Returns:
            Full text content or None if fetch fails
        """
        params = {
            'action': 'query',
            'titles': title,
            'prop': 'revisions',
            'rvprop': 'content',
            'rvslots': 'main',
            'format': 'json'
        }

        try:
            response = self.session.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            pages = data.get('query', {}).get('pages', {})
            page_id = list(pages.keys())[0]

            if page_id == '-1':
                logger.warning(f"Page not found: {title}")
                return None

            page = pages[page_id]
            revisions = page.get('revisions', [])

            if not revisions:
                return None

            content = revisions[0].get('slots', {}).get('main', {}).get('*', '')

            # Clean up wiki markup (basic cleanup - more sophisticated parsing may be needed)
            text = self._clean_wikitext(content)

            return text

        except (requests.RequestException, KeyError, IndexError) as e:
            logger.error(f"Error fetching text for '{title}': {e}")
            return None

    def _extract_author(self, title: str, revision: Dict) -> Optional[str]:
        """Extract author from title or content."""
        # Common patterns: "Title (Author)", "Author/Title", etc.
        if '(' in title and ')' in title:
            # Extract text in parentheses
            start = title.rfind('(')
            end = title.rfind(')')
            if start < end:
                author = title[start + 1:end].strip()
                if author and not author.isdigit():  # Not just a year
                    return author

        # Try to extract from wikitext headers
        content = revision.get('slots', {}).get('main', {}).get('*', '')
        if '{{header' in content.lower():
            # Look for author field in header template
            for line in content.split('\n')[:20]:  # Check first 20 lines
                if 'author' in line.lower() and '=' in line:
                    author = line.split('=', 1)[1].strip().strip('|').strip()
                    if author and not author.startswith('{'):
                        return author

        return None

    def _extract_year(self, revision: Dict) -> Optional[int]:
        """Extract publication year from content."""
        content = revision.get('slots', {}).get('main', {}).get('*', '')

        # Look for year in header template
        for line in content.split('\n')[:30]:  # Check first 30 lines
            if 'year' in line.lower() and '=' in line:
                year_str = line.split('=', 1)[1].strip().strip('|').strip()
                try:
                    return int(year_str)
                except ValueError:
                    continue

        return None

    def _clean_wikitext(self, text: str) -> str:
        """
        Basic wikitext cleanup.

        Removes common MediaWiki markup to get cleaner text.
        For production use, consider using a proper wikitext parser like mwparserfromhell.
        """
        # Remove templates (basic - {{template}})
        import re

        # Remove header templates
        text = re.sub(r'\{\{header[^\}]*\}\}', '', text, flags=re.IGNORECASE | re.DOTALL)

        # Remove footer templates
        text = re.sub(r'\{\{footer[^\}]*\}\}', '', text, flags=re.IGNORECASE | re.DOTALL)

        # Remove simple templates
        text = re.sub(r'\{\{[^\}]+\}\}', '', text)

        # Remove wiki links but keep text [[link|text]] -> text or [[link]] -> link
        text = re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', text)
        text = re.sub(r'\[\[([^\]]+)\]\]', r'\1', text)

        # Remove external links
        text = re.sub(r'\[http[^\]]+\]', '', text)

        # Remove category tags
        text = re.sub(r'\[\[Category:[^\]]+\]\]', '', text, flags=re.IGNORECASE)

        # Remove comments
        text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

        # Clean up excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)

        return text.strip()

    def search_subcategories(self, category: str = "Plays") -> List[str]:
        """
        Get all subcategories of a category.

        Useful for discovering specialized play collections.

        Args:
            category: Parent category name

        Returns:
            List of subcategory names
        """
        params = {
            'action': 'query',
            'list': 'categorymembers',
            'cmtitle': f'Category:{category}',
            'cmtype': 'subcat',
            'cmlimit': 500,
            'format': 'json'
        }

        try:
            response = self.session.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            members = data.get('query', {}).get('categorymembers', [])
            subcategories = [m['title'].replace('Category:', '') for m in members]

            logger.info(f"Found {len(subcategories)} subcategories under '{category}'")
            return subcategories

        except requests.RequestException as e:
            logger.error(f"Error fetching subcategories for '{category}': {e}")
            return []
