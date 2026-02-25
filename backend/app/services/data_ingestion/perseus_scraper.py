"""
Perseus Digital Library scraper for classical Greek and Roman drama.

Legal status: All content is public domain (classical texts).
Language: English translations.
API: Perseus Catalog API and XML-based text access.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET

import requests

logger = logging.getLogger(__name__)


class PerseusScraper:
    """
    Scraper for classical Greek and Roman drama from Perseus Digital Library.

    Perseus provides authoritative classical texts with multiple English translations.
    All content is public domain and scholarly annotated.
    """

    # Perseus API and data endpoints
    CATALOG_API = "https://catalog.perseus.org"
    TEXT_API = "https://www.perseus.tufts.edu/hopper/text"
    CTS_API = "https://cts.perseids.org/api/cts"

    RATE_LIMIT_DELAY = 1.5  # 1.5 seconds between requests

    # Known classical dramatists
    CLASSICAL_DRAMATISTS = {
        'greek': [
            'Aeschylus',
            'Sophocles',
            'Euripides',
            'Aristophanes',
            'Menander'
        ],
        'roman': [
            'Plautus',
            'Terence',
            'Seneca'
        ]
    }

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'ActorRise/1.0 (https://actorrise.com; classical drama research)'
        })

    def get_classical_plays(self, language: str = 'en') -> List[Dict]:
        """
        Get all classical Greek and Roman plays available in English.

        Args:
            language: Language code ('en' for English translations)

        Returns:
            List of play metadata dicts
        """
        plays = []

        logger.info("Fetching classical Greek and Roman plays from Perseus...")

        # Fetch plays for each known dramatist
        for tradition in ['greek', 'roman']:
            for author in self.CLASSICAL_DRAMATISTS[tradition]:
                author_plays = self.search_by_author(author, language)
                plays.extend(author_plays)
                time.sleep(self.RATE_LIMIT_DELAY)

        logger.info(f"Found {len(plays)} classical plays from Perseus")
        return plays

    def search_by_author(self, author: str, language: str = 'en') -> List[Dict]:
        """
        Search for plays by a specific classical author.

        Args:
            author: Author name (e.g., "Sophocles", "Euripides")
            language: Language code for translations

        Returns:
            List of play metadata
        """
        logger.info(f"Searching Perseus for plays by {author}...")

        # Use CTS API to get catalog entries
        params = {
            'request': 'GetCapabilities',
            'urn': f'urn:cts:greekLit:tlg*'  # Thesaurus Linguae Graecae URNs
        }

        plays = []

        try:
            # For now, use known works catalog
            # In production, parse CTS GetCapabilities response
            plays = self._get_known_works(author, language)

        except requests.RequestException as e:
            logger.error(f"Error searching Perseus for {author}: {e}")

        return plays

    def _get_known_works(self, author: str, language: str) -> List[Dict]:
        """
        Get known works for classical authors.

        This is a curated list of major works. In production, use CTS API
        to dynamically fetch all available works.
        """
        # Curated catalog of major classical plays
        known_works = {
            'Aeschylus': [
                {'title': 'Agamemnon', 'year': -458},
                {'title': 'The Libation Bearers', 'year': -458},
                {'title': 'The Eumenides', 'year': -458},
                {'title': 'The Persians', 'year': -472},
                {'title': 'Seven Against Thebes', 'year': -467},
                {'title': 'The Suppliants', 'year': -463},
                {'title': 'Prometheus Bound', 'year': -430}
            ],
            'Sophocles': [
                {'title': 'Oedipus Rex', 'year': -429},
                {'title': 'Oedipus at Colonus', 'year': -401},
                {'title': 'Antigone', 'year': -441},
                {'title': 'Ajax', 'year': -450},
                {'title': 'Electra', 'year': -418},
                {'title': 'Philoctetes', 'year': -409},
                {'title': 'The Trachiniae', 'year': -450}
            ],
            'Euripides': [
                {'title': 'Medea', 'year': -431},
                {'title': 'Hippolytus', 'year': -428},
                {'title': 'The Bacchae', 'year': -405},
                {'title': 'Alcestis', 'year': -438},
                {'title': 'Andromache', 'year': -425},
                {'title': 'Hecuba', 'year': -424},
                {'title': 'The Trojan Women', 'year': -415},
                {'title': 'Electra', 'year': -420},
                {'title': 'Iphigenia in Aulis', 'year': -405},
                {'title': 'Iphigenia in Tauris', 'year': -414},
                {'title': 'Orestes', 'year': -408}
            ],
            'Aristophanes': [
                {'title': 'The Clouds', 'year': -423},
                {'title': 'The Frogs', 'year': -405},
                {'title': 'Lysistrata', 'year': -411},
                {'title': 'The Birds', 'year': -414},
                {'title': 'The Acharnians', 'year': -425},
                {'title': 'The Knights', 'year': -424},
                {'title': 'The Wasps', 'year': -422},
                {'title': 'Peace', 'year': -421},
                {'title': 'Thesmophoriazusae', 'year': -411}
            ],
            'Plautus': [
                {'title': 'Amphitryon', 'year': -190},
                {'title': 'The Menaechmi', 'year': -200},
                {'title': 'Miles Gloriosus', 'year': -205},
                {'title': 'Pseudolus', 'year': -191}
            ],
            'Terence': [
                {'title': 'The Woman of Andros', 'year': -166},
                {'title': 'The Self-Tormentor', 'year': -163},
                {'title': 'The Eunuch', 'year': -161},
                {'title': 'Phormio', 'year': -161},
                {'title': 'The Mother-in-Law', 'year': -160},
                {'title': 'The Brothers', 'year': -160}
            ],
            'Seneca': [
                {'title': 'Medea', 'year': 50},
                {'title': 'Phaedra', 'year': 50},
                {'title': 'Oedipus', 'year': 50},
                {'title': 'Thyestes', 'year': 62}
            ]
        }

        works = known_works.get(author, [])

        return [
            {
                'title': work['title'],
                'author': author,
                'year': abs(work['year']) if work['year'] < 0 else work['year'],
                'year_bce': work['year'] < 0,
                'url': f"https://www.perseus.tufts.edu/hopper/searchresults?q={author}+{work['title']}",
                'source': 'perseus',
                'copyright_status': 'public_domain',
                'language': language,
                'tradition': 'Greek' if author in self.CLASSICAL_DRAMATISTS['greek'] else 'Roman',
                'genre': 'Tragedy' if author != 'Aristophanes' else 'Comedy'
            }
            for work in works
        ]

    def fetch_play_text(
        self,
        author: str,
        title: str,
        translator: Optional[str] = None
    ) -> Optional[str]:
        """
        Fetch full text of a classical play.

        Args:
            author: Author name
            title: Play title
            translator: Preferred translator (optional)

        Returns:
            Full text or None if not found
        """
        # Construct Perseus URL
        # Format: https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0001
        # These are CTS URNs that need to be looked up

        logger.info(f"Fetching text for {author} - {title}")

        # This requires CTS URN lookup
        # For production implementation, use the CTS API to:
        # 1. Resolve author + title to CTS URN
        # 2. Fetch XML text using GetPassage request
        # 3. Parse TEI XML to extract clean text

        logger.warning(
            "Perseus text fetching requires CTS URN resolution. "
            "Use the CTS API GetCapabilities and GetPassage endpoints."
        )

        return None

    def get_available_translations(
        self,
        author: str,
        title: str
    ) -> List[Dict]:
        """
        Get available English translations for a play.

        Args:
            author: Author name
            title: Play title

        Returns:
            List of translation metadata
        """
        # Perseus often has multiple translations
        # This would query the CTS API to get all available versions

        logger.info(f"Checking translations for {author} - {title}")

        # Placeholder - requires CTS API integration
        return []

    def get_text_by_urn(self, cts_urn: str) -> Optional[str]:
        """
        Fetch text using CTS URN.

        Args:
            cts_urn: CTS URN identifier (e.g., 'urn:cts:greekLit:tlg0011.tlg001.perseus-eng1')

        Returns:
            Text content or None
        """
        params = {
            'request': 'GetPassage',
            'urn': cts_urn
        }

        try:
            response = self.session.get(self.CTS_API, params=params, timeout=10)
            response.raise_for_status()

            # Parse XML response
            root = ET.fromstring(response.content)

            # Extract text from TEI XML
            # Namespace handling for CTS/TEI
            namespaces = {
                'tei': 'http://www.tei-c.org/ns/1.0',
                'cts': 'http://chs.harvard.edu/xmlns/cts'
            }

            # Get passage text
            passage = root.find('.//cts:passage', namespaces)
            if passage is not None:
                return ''.join(passage.itertext())

            return None

        except (requests.RequestException, ET.ParseError) as e:
            logger.error(f"Error fetching CTS URN {cts_urn}: {e}")
            return None


# Integration guide
"""
🎯 RECOMMENDED APPROACH: Use Perseus GitHub Repositories (Easier & Better)

Instead of using the CTS API, directly access Perseus's XML text repositories:

1. **Clone Perseus GitHub repos** (one-time setup):
   git clone https://github.com/PerseusDL/canonical-greekLit.git
   git clone https://github.com/PerseusDL/canonical-latinLit.git

   License: CC-BY-SA-4.0 (commercial use allowed with attribution)

2. **Parse TEI XML files**:
   - All texts are in TEI XML format
   - Well-structured with speaker tags, line numbers, etc.
   - Use Python's xml.etree.ElementTree or lxml
   - Extract character speeches for monologue detection

3. **File structure**:
   canonical-greekLit/data/{author}/{work}/
   - e.g., data/tlg0011/tlg001/ (Sophocles Antigone)
   - Multiple translations available per work
   - Filter for English translations (*.perseus-eng*.xml)

4. **Benefits over CTS API**:
   - Offline access (no API calls)
   - Faster (no network latency)
   - No rate limits
   - Full control over parsing
   - GitHub keeps repos updated

5. **Example integration**:
   ```python
   import xml.etree.ElementTree as ET

   def parse_perseus_play(xml_path):
       tree = ET.parse(xml_path)
       root = tree.getroot()
       # Parse TEI structure: <sp who="character"><speaker>...</speaker><l>...</l></sp>
       # Extract monologues from consecutive <l> (line) elements by same speaker
   ```

Alternative: CTS API approach (if GitHub access not feasible)

To fully integrate Perseus via CTS API:

1. Use the CTS API to dynamically discover works:
   - GetCapabilities to list all available texts
   - Filter for Greek/Roman drama
   - Get all English translations

2. Fetch texts using GetPassage:
   - Parse TEI XML format
   - Extract character names for monologue detection
   - Handle verse structure

3. Example CTS URNs for major works:
   - Sophocles Antigone (English): urn:cts:greekLit:tlg0011.tlg001.perseus-eng1
   - Euripides Medea (English): urn:cts:greekLit:tlg0006.tlg012.perseus-eng1
   - Aeschylus Agamemnon (English): urn:cts:greekLit:tlg0085.tlg001.perseus-eng1

4. Perseus provides multiple translations:
   - Compare quality and completeness
   - Prefer scholarly translations
   - Attribute translator in metadata

5. API Documentation:
   - CTS Protocol: http://www.homermultitext.org/hmt-doc/cite/cts-urn-overview.html
   - Perseus CTS: https://github.com/PerseusDL/catalog_data
"""
