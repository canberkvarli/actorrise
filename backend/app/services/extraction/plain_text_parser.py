"""Extract monologues from plain text plays using pattern matching."""

import re
from typing import List, Dict, Optional


class PlainTextParser:
    """Extract monologues from plain text plays using NLP"""

    #: A speaker cue set in Gutenberg's italic markup at the start of a line:
    #: "_Mother._", "_Little Red Riding-Hood._". Length-capped so a whole
    #: italicised sentence cannot be mistaken for a name.
    _ITALIC_CUE = re.compile(r'^_([A-Z][^_\n]{0,44}?)\._[ \t]*', re.MULTILINE)

    #: Italicised spans inside a speech are stage directions ("_Exit._",
    #: "_She turns away._"), the underscore equivalent of a parenthetical.
    _ITALIC_SPAN = re.compile(r'_[^_\n]{0,200}?_')

    def __init__(self):
        pass

    def extract_monologues(
        self,
        text: str,
        min_words: int = 50,
        max_words: int = 500
    ) -> List[Dict]:
        """
        Extract monologues from plain text using pattern matching.

        Common play formats:
        CHARACTER:
            Line of dialogue...
            Another line...

        Or:

        CHARACTER. Line of dialogue...
        """
        monologues = []

        # Pattern 1: Character name followed by colon (most common)
        # Matches: "HAMLET:\n  To be or not to be..."
        pattern1 = r'([A-Z][A-Z\s\-\.]+):\s*\n((?:(?!\n[A-Z][A-Z\s\-\.]+:)(?!\n\n[A-Z][A-Z\s\-\.]+\.).)+'
        pattern1 += r'(?:\n(?![ \t]*\n)(?![A-Z][A-Z\s\-\.]+:).)*)'

        # Pattern 2: Character name in all caps at start of line followed by period
        # Matches: "HAMLET. To be or not to be..."
        pattern2 = r'\n([A-Z][A-Z\s\-\.]+)\.\s+([^\n]+(?:\n(?![A-Z][A-Z\s\-\.]+[\.:])[^\n]+)*)'

        speeches = []

        # Try pattern 1 (colon format)
        for match in re.finditer(pattern1, text, re.MULTILINE):
            character = match.group(1).strip()
            speech_text = match.group(2).strip()
            speeches.append((character, speech_text))

        # If pattern 1 didn't find much, try pattern 2
        if len(speeches) < 5:
            speeches = []
            for match in re.finditer(pattern2, text, re.MULTILINE):
                character = match.group(1).strip()
                speech_text = match.group(2).strip()
                speeches.append((character, speech_text))

        # Pattern 3: Gutenberg italic cues — "_Mother._ Would you like to..."
        #
        # Both patterns above require an ALL-CAPS name, so a text that italicises
        # its speakers in Title Case yields literally nothing. That is not an
        # edge case: it is how a large share of Gutenberg's play transcriptions
        # are typeset, and it is the same format-blindness that made the
        # Folger-style texts produce zero monologues.
        #
        # Matched by walking cue positions rather than one regex, because a
        # speech runs until the NEXT cue and expressing that as a single
        # lookahead-heavy pattern is where the other two became unreadable.
        if len(speeches) < 5:
            speeches = []
            cues = list(self._ITALIC_CUE.finditer(text))
            for i, m in enumerate(cues):
                end = cues[i + 1].start() if i + 1 < len(cues) else len(text)
                speeches.append((m.group(1).strip(), text[m.end():end].strip()))

        # Filter and clean speeches
        for character, speech_text in speeches:
            # Remove stage directions (parentheses, brackets, or italics)
            clean_text = re.sub(r'\([^)]+\)|\[[^\]]+\]', '', speech_text)
            clean_text = self._ITALIC_SPAN.sub(' ', clean_text)
            clean_text = clean_text.replace('_', '')  # stray markup

            # Remove extra whitespace
            clean_text = re.sub(r'\s+', ' ', clean_text).strip()

            # Skip if too short or starts with common non-dialogue indicators
            if not clean_text or clean_text.lower().startswith(('scene', 'act', 'enter', 'exit')):
                continue

            word_count = len(clean_text.split())

            if min_words <= word_count <= max_words:
                monologues.append({
                    'character': self._normalize_character_name(character),
                    'text': clean_text,
                    'word_count': word_count,
                    'stage_directions': self._extract_stage_directions(speech_text)
                })

        return monologues

    def _normalize_character_name(self, name: str) -> str:
        """Convert 'HAMLET' to 'Hamlet', handle edge cases"""
        # A cue often carries a direction: "_Little Red Riding-Hood (Singing)._"
        # Without this the direction becomes part of the character's name, so the
        # same character appears twice in the cast and once with stage business
        # stapled to them.
        name = re.sub(r'\s*[\(\[][^\)\]]*[\)\]]', '', name)

        # Remove periods and extra spaces
        name = name.replace('.', '').strip()

        # Convert to title case
        name = name.title()

        # Fix common abbreviations
        name = name.replace('Dr.', 'Dr')
        name = name.replace('Mr.', 'Mr')
        name = name.replace('Mrs.', 'Mrs')
        name = name.replace('Ms.', 'Ms')

        return name

    def _extract_stage_directions(self, text: str) -> Optional[str]:
        """Extract stage directions from text"""
        directions = []

        # Find text in parentheses
        paren_matches = re.findall(r'\(([^)]+)\)', text)
        directions.extend(paren_matches)

        # Find text in brackets
        bracket_matches = re.findall(r'\[([^\]]+)\]', text)
        directions.extend(bracket_matches)

        if directions:
            return ' '.join(directions)
        return None
