"""Extract text from PDF scripts and parse monologues."""

import pdfplumber
from typing import List, Dict
from .plain_text_parser import PlainTextParser


class PDFParser:
    """Extract monologues from PDF scripts"""

    def __init__(self):
        self.text_parser = PlainTextParser()

    def extract_monologues(
        self,
        pdf_path: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """Extract monologues from PDF scripts"""

        try:
            # Extract text from PDF
            full_text = ""
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        full_text += text + "\n"

            # Use plain text parser to extract monologues
            return self.text_parser.extract_monologues(full_text, min_words, max_words)

        except Exception as e:
            print(f"Error extracting from PDF: {e}")
            return []
