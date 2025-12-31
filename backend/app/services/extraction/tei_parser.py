"""Parse TEI-encoded plays (XML format used by scholarly editions)."""

from lxml import etree
import re
from typing import List, Dict, Optional


class TEIParser:
    """Parse TEI-encoded plays (XML format used by scholarly editions)"""

    def extract_monologues(
        self,
        tei_xml: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """
        Extract monologues from TEI-encoded play text.

        TEI structure:
        <sp who="#hamlet">
            <speaker>Hamlet</speaker>
            <l>To be, or not to be, that is the question:</l>
            <l>Whether 'tis nobler in the mind to suffer</l>
            ...
        </sp>
        """
        try:
            tree = etree.fromstring(tei_xml.encode('utf-8'))
        except Exception as e:
            print(f"Error parsing TEI XML: {e}")
            return []

        monologues = []

        # Define TEI namespace (common in TEI documents)
        namespaces = {'tei': 'http://www.tei-c.org/ns/1.0'}

        # Try with namespace first
        speeches = tree.xpath('//tei:sp', namespaces=namespaces)

        # If no speeches found with namespace, try without
        if not speeches:
            speeches = tree.xpath('//sp')

        for speech in speeches:
            # Extract speaker
            speaker_elem = speech.xpath('.//tei:speaker | .//speaker', namespaces=namespaces)
            speaker = speaker_elem[0].text if speaker_elem and speaker_elem[0].text else "Unknown"

            # Extract lines (could be <l>, <p>, or <ab> tags)
            lines = speech.xpath('.//tei:l | .//tei:p | .//tei:ab | .//l | .//p | .//ab',
                               namespaces=namespaces)

            text_lines = []
            for line in lines:
                line_text = self._get_element_text(line)
                if line_text:
                    text_lines.append(line_text)

            if not text_lines:
                continue

            full_text = '\n'.join(text_lines)

            # Extract stage directions
            stage_dirs = speech.xpath('.//tei:stage | .//stage', namespaces=namespaces)
            directions = []
            for sd in stage_dirs:
                sd_text = self._get_element_text(sd)
                if sd_text:
                    directions.append(sd_text)

            word_count = len(full_text.split())

            # Filter by length
            if min_words <= word_count <= max_words:
                monologues.append({
                    'character': self._clean_speaker_name(speaker),
                    'text': full_text,
                    'stage_directions': ' '.join(directions) if directions else None,
                    'word_count': word_count
                })

        return monologues

    def _get_element_text(self, element) -> str:
        """Extract clean text from XML element"""
        try:
            # Get all text content, including nested elements
            text = ''.join(element.itertext())
            # Clean up whitespace
            text = re.sub(r'\s+', ' ', text).strip()
            return text
        except Exception:
            return ""

    def _clean_speaker_name(self, name: str) -> str:
        """Clean and normalize speaker name"""
        # Remove extra whitespace
        name = re.sub(r'\s+', ' ', name).strip()

        # Remove common stage direction prefixes
        name = re.sub(r'^\[.*?\]\s*', '', name)

        # Convert to title case if all caps
        if name.isupper():
            name = name.title()

        return name
