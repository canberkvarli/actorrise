"""Main service for extracting monologues from various formats."""

from typing import List, Dict
from .tei_parser import TEIParser
from .plain_text_parser import PlainTextParser
from .pdf_parser import PDFParser


class MonologueExtractor:
    """Main service for extracting monologues from various formats"""

    def __init__(self):
        self.tei_parser = TEIParser()
        self.plain_text_parser = PlainTextParser()
        self.pdf_parser = PDFParser()

    def extract_from_source(
        self,
        content: str,
        format_type: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """
        Extract monologues from various source formats.

        Args:
            content: The source text or file path
            format_type: 'tei_xml', 'plain_text', 'pdf', 'html'
            min_words: Minimum word count for a monologue
            max_words: Maximum word count for a monologue

        Returns:
            List of monologue dictionaries with keys:
                - character: str
                - text: str
                - word_count: int
                - stage_directions: str | None
        """
        if format_type == 'tei_xml':
            return self.tei_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'plain_text':
            return self.plain_text_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'pdf':
            return self.pdf_parser.extract_monologues(content, min_words, max_words)

        elif format_type == 'html':
            # Convert HTML to plain text first
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            plain_text = soup.get_text()
            return self.plain_text_parser.extract_monologues(plain_text, min_words, max_words)

        else:
            raise ValueError(f"Unsupported format: {format_type}")
