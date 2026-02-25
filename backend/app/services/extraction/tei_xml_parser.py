"""
Parse TEI XML format plays (used by Perseus Digital Library and other scholarly sources).

TEI (Text Encoding Initiative) is a standard XML format for encoding texts in digital humanities.
Perseus uses TEI XML for their classical texts with speaker tags, line numbers, and stage directions.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional


class TEIXMLParser:
    """
    Parser for TEI XML formatted plays.

    Handles the structure used by Perseus Digital Library canonical repositories:
    - https://github.com/PerseusDL/canonical-greekLit
    - https://github.com/PerseusDL/canonical-latinLit
    """

    # TEI namespace (standard)
    TEI_NS = {'tei': 'http://www.tei-c.org/ns/1.0'}

    def __init__(self):
        pass

    def extract_monologues(
        self,
        xml_content: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """
        Extract monologues from TEI XML play text.

        TEI structure for drama:
        <sp who="#character"> (speech)
          <speaker>Character Name</speaker>
          <l>Line 1 of dialogue</l>
          <l>Line 2 of dialogue</l>
          ...
        </sp>

        Args:
            xml_content: TEI XML string
            min_words: Minimum word count for monologue
            max_words: Maximum word count for monologue

        Returns:
            List of monologue dicts with character, text, word_count, stage_directions
        """
        monologues = []

        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            # Try to handle common XML issues
            # Sometimes XML has encoding declaration that ElementTree doesn't like
            xml_content = re.sub(r'<\?xml[^>]+\?>', '', xml_content)
            try:
                root = ET.fromstring(xml_content)
            except ET.ParseError:
                return []

        # Find all speeches (<sp> elements)
        speeches = root.findall('.//tei:sp', self.TEI_NS)

        # Also try without namespace if not found
        if not speeches:
            speeches = root.findall('.//sp')

        for speech in speeches:
            try:
                # Get character name from speaker tag or 'who' attribute
                character = self._extract_character(speech)

                if not character:
                    continue

                # Extract speech text from <l> (line) elements or <p> (paragraph) elements
                lines = speech.findall('.//tei:l', self.TEI_NS) or speech.findall('.//l')

                if not lines:
                    # Try paragraph format
                    lines = speech.findall('.//tei:p', self.TEI_NS) or speech.findall('.//p')

                if not lines:
                    continue

                # Combine all lines
                speech_text = []
                stage_dirs = []

                for line in lines:
                    line_text = ''.join(line.itertext())

                    # Extract stage directions (usually in <stage> tags)
                    stage_elements = line.findall('.//tei:stage', self.TEI_NS) or line.findall('.//stage')
                    for stage in stage_elements:
                        stage_text = ''.join(stage.itertext()).strip()
                        if stage_text:
                            stage_dirs.append(stage_text)
                            # Remove stage directions from main text
                            line_text = line_text.replace(stage_text, '')

                    line_text = line_text.strip()
                    if line_text:
                        speech_text.append(line_text)

                if not speech_text:
                    continue

                # Join lines into single text
                full_text = ' '.join(speech_text)

                # Clean up extra whitespace
                full_text = re.sub(r'\s+', ' ', full_text).strip()

                # Count words
                word_count = len(full_text.split())

                # Filter by word count
                if min_words <= word_count <= max_words:
                    monologue = {
                        'character': character,
                        'text': full_text,
                        'word_count': word_count,
                        'stage_directions': ' '.join(stage_dirs) if stage_dirs else None
                    }
                    monologues.append(monologue)

            except Exception as e:
                # Skip problematic speeches
                continue

        return monologues

    def _extract_character(self, speech_element) -> Optional[str]:
        """
        Extract character name from speech element.

        Checks (in order):
        1. <speaker> tag text
        2. 'who' attribute
        3. 'n' attribute (sometimes used for speaker label)
        """
        # Try <speaker> tag first (with and without namespace)
        speaker = speech_element.find('tei:speaker', self.TEI_NS)
        if speaker is None:
            speaker = speech_element.find('speaker')

        if speaker is not None and speaker.text:
            return self._normalize_character_name(speaker.text)

        # Try 'who' attribute
        who = speech_element.get('who')
        if who:
            # Remove # prefix if present (TEI convention for ID references)
            who = who.lstrip('#')
            return self._normalize_character_name(who)

        # Try 'n' attribute
        n = speech_element.get('n')
        if n:
            return self._normalize_character_name(n)

        return None

    def _normalize_character_name(self, name: str) -> str:
        """
        Normalize character name to Title Case.

        Handles:
        - ALL CAPS -> Title Case
        - #character_id -> Character Id
        - Underscores/hyphens -> spaces
        """
        if not name:
            return "Unknown"

        # Remove # prefix
        name = name.lstrip('#')

        # Replace underscores and hyphens with spaces
        name = name.replace('_', ' ').replace('-', ' ')

        # Convert to title case
        name = name.title()

        return name.strip()

    def extract_play_metadata(self, xml_content: str) -> Dict:
        """
        Extract metadata from TEI XML header.

        Returns dict with: title, author, date, language
        """
        metadata = {
            'title': None,
            'author': None,
            'year': None,
            'language': 'en'
        }

        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError:
            xml_content = re.sub(r'<\?xml[^>]+\?>', '', xml_content)
            try:
                root = ET.fromstring(xml_content)
            except ET.ParseError:
                return metadata

        # Find teiHeader
        header = root.find('.//tei:teiHeader', self.TEI_NS)
        if header is None:
            header = root.find('.//teiHeader')

        if header is not None:
            # Extract title
            title_elem = header.find('.//tei:title', self.TEI_NS)
            if title_elem is None:
                title_elem = header.find('.//title')
            if title_elem is not None and title_elem.text:
                metadata['title'] = title_elem.text.strip()

            # Extract author
            author_elem = header.find('.//tei:author', self.TEI_NS)
            if author_elem is None:
                author_elem = header.find('.//author')
            if author_elem is not None and author_elem.text:
                metadata['author'] = author_elem.text.strip()

            # Extract date
            date_elem = header.find('.//tei:date', self.TEI_NS)
            if date_elem is None:
                date_elem = header.find('.//date')
            if date_elem is not None:
                # Try 'when' attribute first
                when = date_elem.get('when')
                if when:
                    try:
                        metadata['year'] = int(when.split('-')[0])
                    except ValueError:
                        pass
                # Otherwise try text content
                elif date_elem.text:
                    try:
                        year_match = re.search(r'\d{4}', date_elem.text)
                        if year_match:
                            metadata['year'] = int(year_match.group())
                    except ValueError:
                        pass

            # Extract language
            lang_elem = root.find('.//tei:langUsage', self.TEI_NS)
            if lang_elem is None:
                lang_elem = root.find('.//langUsage')
            if lang_elem is not None:
                lang = lang_elem.find('.//tei:language', self.TEI_NS)
                if lang is None:
                    lang = lang_elem.find('.//language')
                if lang is not None:
                    lang_ident = lang.get('ident')
                    if lang_ident:
                        metadata['language'] = lang_ident[:2]  # Take first 2 chars (e.g., 'eng' -> 'en')

        return metadata

    def is_valid_tei_xml(self, xml_content: str) -> bool:
        """
        Check if content is valid TEI XML.

        Returns True if parseable and has TEI structure.
        """
        try:
            root = ET.fromstring(xml_content)
            # Check for TEI root or teiHeader
            return (
                root.tag.endswith('TEI') or
                root.find('.//tei:teiHeader', self.TEI_NS) is not None or
                root.find('.//teiHeader') is not None
            )
        except ET.ParseError:
            return False
