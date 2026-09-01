"""Extract monologues from plain text plays using pattern matching."""

import re
from typing import Dict, List, Optional


class PlainTextParser:
    """Extract monologues from plain text plays using NLP"""

    #: A speaker cue set in Gutenberg's italic markup at the start of a line:
    #: "_Mother._", "_Little Red Riding-Hood._". Length-capped so a whole
    #: italicised sentence cannot be mistaken for a name.
    _ITALIC_CUE = re.compile(r'^_([A-Z][^_\n]{0,44}?)\._[ \t]*', re.MULTILINE)

    #: Italicised spans inside a speech are stage directions ("_Exit._",
    #: "_She turns away._"), the underscore equivalent of a parenthetical.
    _ITALIC_SPAN = re.compile(r'_[^_\n]{0,200}?_')

    #: A Title Case speaker cue: "Dorine.  ", "Mrs. Stockmann. ", "Mme. Pernelle. ".
    #: One optional honorific, then the name. Both other patterns demand ALL CAPS,
    #: which is why Tartuffe, Rosmersholm and An Enemy of the People sat in the
    #: library with zero monologues each despite their full text being stored.
    _TITLE_CUE = re.compile(
        r"^[ \t]{0,8}((?:[A-Z][a-z']{0,11}\.[ ]?)?[A-Z][A-Za-z'’]{1,15})\.[ \t]+"
        r"(?=[A-Z\"'“(])",
        re.MULTILINE,
    )

    #: An honorific on its own is not a character. Without this, "Mr." and "Mrs."
    #: become the two most talkative people in the play.
    _HONORIFICS = frozenset({
        "mr", "mrs", "ms", "dr", "mme", "mlle", "m", "sir", "lady", "lord",
        "st", "capt", "gen", "rev", "prof", "col", "maj", "sgt",
    })

    #: How many times a cue must recur before it counts as a character. A speaker
    #: comes back; a sentence that merely opens on a capitalised word and a full
    #: stop does not. This is the whole defence against turning narration into a
    #: cast list, so it is deliberately not 1 or 2.
    _MIN_CUE_REPEATS = 5

    #: Words that head a section, not a person. "ACT IV" and "SCENE I" recur as
    #: faithfully as any character and read as cues to every pattern here.
    _STRUCTURAL = frozenset({
        "act", "scene", "prologue", "epilogue", "preface", "note", "notes",
        "characters", "persons", "dramatis", "personae", "contents", "index",
        "introduction", "appendix", "footnote", "curtain", "end", "chapter",
    })

    #: Roman numerals, which is what an act number looks like once it has been
    #: title-cased: "Iv", "Ix", "Xlix".
    _ROMAN = re.compile(r"^[IVXLCDM]+$", re.IGNORECASE)

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

        # Pattern 4: Title Case cues — "Dorine.  He passes for a saint..."
        #
        # Gutenberg's Ibsen, Molière, Chekhov and Pinero transcriptions name
        # their speakers in Title Case, which neither ALL-CAPS pattern can see.
        # Measure for Measure parses and Tartuffe does not, for no better reason
        # than the case of the cue.
        #
        # Two passes, because a single regex cannot tell "Dorine." from any
        # sentence beginning with a capitalised word and a full stop. The first
        # pass proposes names, the second keeps only those that recur, and the
        # speech then runs from one confirmed cue to the next.
        if len(speeches) < 5:
            cast = self._title_case_cast(text)
            if cast:
                speeches = self._split_on_cast(text, cast)

        # Every pattern feeds through the same sanity check on the name. A cue
        # that turns out to be an act heading takes its whole "speech" with it,
        # which is the act's entire text.
        speeches = [
            (character, body)
            for character, body in speeches
            if self._is_plausible_character(character)
        ]

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

    def _is_plausible_character(self, name: str) -> bool:
        """Reject the things that behave like speakers but are not people.

        Applied to every pattern, not just the Title Case one, because the two
        ALL-CAPS patterns match ``[A-Z\\s]`` and ``\\s`` includes newlines — so
        "ACT IV\\n\\nSCENE I" arrives as one character called
        "Act Iv Scene I". That predates the Title Case cue and is why
        Measure for Measure's names were unusable even where its text parsed.
        """
        cleaned = " ".join(name.split())
        if not cleaned or len(cleaned) > 40:
            return False
        if "\n" in name or "\r" in name:
            return False
        if self._ROMAN.match(cleaned.replace(".", "")):
            return False
        words = [w.strip(".,;:").lower() for w in cleaned.split()]
        if not words:
            return False
        if words[0] in self._STRUCTURAL:
            return False
        # "Dramatis Personae", "Characters of the Tragedy" — a heading that
        # happens to run long enough to escape the first-word check.
        if any(w in self._STRUCTURAL for w in words) and len(words) > 2:
            return False
        return True

    def _title_case_cast(self, text: str) -> List[str]:
        """Names that behave like speakers: Title Case cues that recur."""
        counts: Dict[str, int] = {}
        for match in self._TITLE_CUE.finditer(text):
            name = match.group(1).strip()
            counts[name] = counts.get(name, 0) + 1
        return [
            name
            for name, hits in counts.items()
            if hits >= self._MIN_CUE_REPEATS
            and name.lower().rstrip(".") not in self._HONORIFICS
            and self._is_plausible_character(name)
        ]

    def _split_on_cast(self, text: str, cast: List[str]) -> List[tuple]:
        """Cut the text at confirmed cues; each speech runs to the next one."""
        # Longest first, or "Stockmann" matches inside "Dr. Stockmann" and the
        # split lands in the middle of the cue it was supposed to sit before.
        alternation = "|".join(
            re.escape(name) for name in sorted(cast, key=len, reverse=True)
        )
        pattern = re.compile(r"^[ \t]{0,8}(" + alternation + r")\.[ \t]+", re.MULTILINE)
        hits = [(m.start(), m.end(), m.group(1)) for m in pattern.finditer(text)]
        speeches = []
        for i, (_, end, name) in enumerate(hits):
            stop = hits[i + 1][0] if i + 1 < len(hits) else len(text)
            speeches.append((name, text[end:stop].strip()))
        return speeches

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
