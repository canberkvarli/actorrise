"""Extract monologues from plain text plays using pattern matching."""

import re
from typing import Dict, List, Optional


class PlainTextParser:
    """Extract monologues from plain text plays using NLP"""

    #: A speaker cue set in Gutenberg's italic markup at the start of a line:
    #: "_Mother._", "_Little Red Riding-Hood._". Length-capped so a whole
    #: italicised sentence cannot be mistaken for a name.
    _ITALIC_CUE = re.compile(r'^_([A-Z][^_\n]{0,44}?)\._[ \t]*', re.MULTILINE)

    #: Italicised spans inside a speech are USUALLY stage directions ("_Exit._",
    #: "_She turns away._"), the underscore equivalent of a parenthetical — but
    #: not always. Gutenberg also italicises emphasis, and across a 25-play
    #: sample 955 of 5,511 spans are one or two lowercase words: "I said _no_".
    #: Treating every span as a direction and deleting it (which is what this
    #: parser did) removed those words from the speech entirely.
    _ITALIC_SPAN = re.compile(r'_([^_\n]{0,200}?)_')

    #: Bracketed spans, on the other hand, are unambiguous: every one of the
    #: 3,011 in that sample is a direction, typically italicised inside the
    #: brackets — "[_Exit._]", "[_Aside._]", "[_Sings._]", "[_Dies._]".
    #:
    #: Newlines allowed inside. Typesetting wraps a long direction across two
    #: lines — "[She goes to the glass door and\nthrows it open.]" — and
    #: excluding \n meant those never converted to `(...)`, so they reached the
    #: gate as raw brackets and were rejected as `bracket_cue`. Our own output,
    #: failing our own check. Still length-bounded and still requires the
    #: closing bracket, so a stray `[` cannot run away with the speech.
    #:
    #: 600, not 200. A wrylie is short but a SCENE description is not — Ibsen
    #: opens with 208 characters of drawing room, glass door and autumn leaves,
    #: which sailed past a 200-char bound, stayed a raw bracket, and was
    #: rejected as `bracket_cue` instead of being recognised as the scene
    #: setting it is and cut by _strip_leading_narrative.
    _BRACKET_SPAN = re.compile(r'\[([^\]]{0,600}?)\]', re.S)

    _PAREN_SPAN = re.compile(r'\(([^)\n]{0,200}?)\)')

    #: How a stage direction opens, when it is set in italics rather than
    #: brackets. Anything matching is a direction; anything else italicised is
    #: emphasis and keeps its words.
    _DIRECTION_WORD = re.compile(
        r"^(?:exit|exeunt|enter|re-enter|aside|within|without|alone|aloud|"
        r"sings?|reads?|dies?|rises?|kneels?|weeps?|laughs?|pauses?|bows?|"
        r"knocking|music|curtain|embracing|pointing|turning|looking|going|"
        r"coming|taking|giving|showing|drawing|throwing|falling|starting|"
        r"crossing|advancing|retiring|seeing|listening|whispering|shouting)\b",
        re.IGNORECASE,
    )

    #: A Title Case speaker cue: "Dorine.  ", "Mrs. Stockmann. ", "Mme. Pernelle. ".
    #: One optional honorific, then the name. Both other patterns demand ALL CAPS,
    #: which is why Tartuffe, Rosmersholm and An Enemy of the People sat in the
    #: library with zero monologues each despite their full text being stored.
    #: The optional trailing surname is load-bearing. Without it "Peter
    #: Stockmann." is not a cue, so every speech of his is swallowed by whoever
    #: spoke last: An Enemy of the People came out with Billing delivering three
    #: people's lines at once. Molière's single-word names hid the gap, because
    #: "Dorine." matches either way.
    #: A cue may carry its own stage direction before the full stop:
    #: "Rebecca (going to the door and calling through it). Mrs. Helseth, ...".
    #: Ibsen does this constantly, and without it every such speech is swallowed
    #: by the previous speaker. Length-capped, and it may wrap across lines.
    #: Brackets as well as parentheses: this translation of Tartuffe writes
    #: "Dorine [aside]." and Ibsen writes "Rebecca (going to the door).".
    #: Allowing only one of the two leaves half the speeches glued to whoever
    #: spoke before them.
    _CUE_DIRECTION = r"(?:[ ]?[\(\[][^)\]]{0,160}[\)\]])?"

    _TITLE_CUE = re.compile(
        r"^[ \t]{0,8}((?:[A-Z][a-z']{0,11}\.[ ]?)?[A-Z][A-Za-z'’]{1,15}"
        r"(?:[ ][A-Z][A-Za-z'’]{1,15})?)" + _CUE_DIRECTION + r"\.[ \t\n]+"
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
        min_words: int = 75,
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

        # A speech that someone briefly interrupted is still one speech.
        speeches = self._merge_interrupted_speeches(speeches)

        # Filter and clean speeches
        for character, speech_text in speeches:
            # Two texts, the same pair screenplay_pdf_parser produces:
            #   display — what the actor reads, directions kept as `(...)` so the
            #             reader can set them italic and muted
            #   spoken  — display minus the directions, which is what a word
            #             floor must measure. A direction is not something the
            #             actor says, so counting it would let
            #             "(He crosses to the window and stands a long while)"
            #             push a thin speech over the bar.
            display = self._strip_leading_narrative(self._to_display(speech_text))
            spoken = self._spoken_only(display)

            # Skip if empty or starts with common non-dialogue indicators
            if not spoken or spoken.lower().startswith(('scene', 'act', 'enter', 'exit')):
                continue

            word_count = len(spoken.split())

            if min_words <= word_count <= max_words:
                monologues.append({
                    'character': self._normalize_character_name(character),
                    'text': display,
                    'dialogue': spoken,
                    'word_count': word_count,
                    'stage_directions': self._extract_stage_directions(speech_text)
                })

        return monologues

    #: What a speech can absorb and still be one speech. A character answering
    #: "Ay, my lord" does not end Hamlet's thought; a character delivering forty
    #: words has started a scene.
    MAX_INTERRUPTION_WORDS = 15

    #: ...and how many times. One or two beats is a speech with interjections in
    #: it; five is a duologue wearing a monologue's name.
    MAX_INTERRUPTIONS = 2

    #: Share of the merged speech that may belong to anyone else. The per-line
    #: caps above are not enough on their own: two 15-word replies inside a
    #: 70-word exchange is still a conversation, and the first cut of this merge
    #: turned 61 of Hamlet's 91 speeches into stitched-together dialogue.
    MAX_INTERJECTION_SHARE = 0.20

    #: A monologue interrupted is still mostly ONE speech, so at least one of
    #: the character's own parts has to be a real run of talking. Without this,
    #: three one-line replies merge into a "monologue" that was never one —
    #: which is exactly what Miss Tesman and Berta looked like.
    MIN_ANCHOR_WORDS = 40

    #: A leading parenthetical this long is not a wrylie, it is the scene being
    #: described before anybody speaks. "(aside)" and "(drinks coffee and looks
    #: away)" are the actor's business and stay; twenty words of furniture and
    #: weather are the story being explained and go.
    SCENE_SETTING_WORDS = 20

    def _merge_interrupted_speeches(
        self, speeches: List[tuple]
    ) -> List[tuple]:
        """Rejoin a speech that a short interruption split in two.

        The cue splitter cuts at every cue, so

            HAMLET  Speak, I am bound to hear.
            GHOST   So art thou to revenge, when thou shalt hear.
            HAMLET  What?

        arrives as two Hamlet fragments with someone else between them, and both
        can fall under the 75-word floor and disappear. That is how a real
        monologue becomes no monologue at all, and it is the single most likely
        reason a play we hold the full text of extracts almost nothing.

        The interrupting line is KEPT, inline, as `(NAME: ...)`. Dropping it
        would leave the speech answering a question the reader cannot see. As a
        parenthetical it does three things at once: `_spoken_only` strips it so
        it cannot pad the word floor, `assess_monologue_quality` counts it
        against the direction share — which is what bounds "too much dialogue" —
        and the segmenter can tag it as an `interjection` for the reader.
        """
        merged: List[tuple] = []
        i, n = 0, len(speeches)
        while i < n:
            character, body = speeches[i]
            parts = [body]                       # this character's own words
            interjections: List[str] = []        # everybody else's
            j = i + 1
            while j + 1 < n and len(interjections) < self.MAX_INTERRUPTIONS:
                other_name, other_body = speeches[j]
                next_name, next_body = speeches[j + 1]
                # The speech has to resume with the SAME speaker, and the thing
                # in between has to be somebody else being brief.
                if next_name != character or other_name == character:
                    break
                interjection = self._spoken_only(self._to_display(other_body))
                # Brackets that never closed survive _to_display, and nesting
                # one inside the "(NAME: ...)" wrapper corrupts both.
                interjection = re.sub(r"[()\[\]]", "", interjection).strip()
                if not interjection:
                    break
                if len(interjection.split()) > self.MAX_INTERRUPTION_WORDS:
                    break
                interjections.append(f"({other_name}: {interjection})")
                parts.append(interjections[-1])
                parts.append(next_body)
                j += 2

            if len(parts) > 1 and not self._merge_is_a_monologue(parts, interjections):
                # It read as a conversation, so leave the pieces alone and let
                # the word floor decide each on its own merits.
                merged.append((character, body))
                i += 1
                continue

            merged.append((character, " ".join(parts)))
            i = j if j > i + 1 else i + 1
        return merged

    def _merge_is_a_monologue(
        self, parts: List[str], interjections: List[str]
    ) -> bool:
        """Is this merge one speech with interruptions, or a scene?"""
        own = [
            self._spoken_only(self._to_display(p))
            for p in parts if p not in interjections
        ]
        own_words = sum(len(p.split()) for p in own)
        other_words = sum(
            max(0, len(s.split()) - 1) for s in interjections  # minus "(NAME:"
        )
        total = own_words + other_words
        if not total:
            return False
        if other_words / total > self.MAX_INTERJECTION_SHARE:
            return False
        # Somewhere in here there has to be an actual run of talking.
        return max((len(p.split()) for p in own), default=0) >= self.MIN_ANCHOR_WORDS

    def _strip_leading_narrative(self, display: str) -> str:
        """Drop scene-setting prose sitting in front of the speech.

        Gutenberg sets a scene description in the same italics or brackets it
        uses for stage directions, so once `_to_display` has normalised it the
        difference between "the story so far" and "what this character does" is
        length. A speech that opens with twenty-plus words of parenthetical is
        opening with the set, not with a line.

        Only the LEADING block, and only if a speech survives it — the point is
        to recover the monologue underneath, not to trim speeches generally.
        """
        text = (display or "").lstrip()
        while text.startswith("("):
            end = text.find(")")
            if end == -1:
                break
            inner = text[1:end]
            if len(inner.split()) < self.SCENE_SETTING_WORDS:
                break                       # a wrylie — the actor wants it
            remainder = text[end + 1:].lstrip()
            if not remainder:
                break                       # nothing underneath; leave it alone
            text = remainder
        return text

    def _to_display(self, speech_text: str) -> str:
        """The speech as the actor should read it, directions kept as `(...)`.

        Brackets and parentheses are directions outright. Italic spans are only
        directions when they read like one (see _DIRECTION_WORD, or a
        capitalised clause closing on a full stop); everything else italicised
        is emphasis and keeps its words, minus the underscores.
        """
        def _bracket(m: re.Match) -> str:
            inner = m.group(1).replace('_', '').strip()
            return f' ({inner}) ' if inner else ' '

        text = self._BRACKET_SPAN.sub(_bracket, speech_text)

        def _italic(m: re.Match) -> str:
            inner = m.group(1).strip()
            if not inner:
                return ' '
            if self._is_direction(inner):
                return f' ({inner.rstrip(".")}.) '
            return f' {inner} '        # emphasis — the words are part of the line

        text = self._ITALIC_SPAN.sub(_italic, text)
        text = text.replace('_', '')            # stray unmatched markup

        # Tidy the spacing the substitutions created, without touching newlines
        # that carry paragraph structure.
        text = re.sub(r'[ \t]+([,.;:!?])', r'\1', text)
        text = re.sub(r'\(\s+', '(', text)
        text = re.sub(r'\s+\)', ')', text)
        return re.sub(r'\s+', ' ', text).strip()

    def _is_direction(self, inner: str) -> bool:
        """Is this italicised span a stage direction rather than emphasis?"""
        s = inner.strip()
        if not s:
            return False
        if self._DIRECTION_WORD.match(s):
            return True
        # "Laying his hand on Laertes's head." — a capitalised clause that closes
        # on a full stop. Emphasis is short and rarely punctuated that way.
        return bool(s[:1].isupper() and s.endswith('.') and len(s.split()) >= 2)

    def _spoken_only(self, display: str) -> str:
        """``display`` with the directions taken back out."""
        text = self._PAREN_SPAN.sub(' ', display)
        text = re.sub(r'[ \t]+([,.;:!?])', r'\1', text)
        return re.sub(r'\s+', ' ', text).strip()

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
        # Two ways in. At the start of a line is the ordinary case. Mid-line
        # after a sentence ends is Molière in verse, where the next speaker's
        # cue follows the previous speaker's closing line on the same line:
        # "...His other traits... Dorine. And they're a sorry lot!"
        #
        # Mid-line is only safe because `cast` is already confirmed and the
        # lookbehind demands a finished sentence. Direct address does not
        # qualify: "Thank you, Dorine." has a comma before the name, and
        # "I never trusted Dorine." has a verb, so neither can split a speech.
        pattern = re.compile(
            r"(?:^[ \t]{0,8}|(?<=[.!?…])[ \t\n]+)"
            r"(" + alternation + r")" + self._CUE_DIRECTION + r"\.[ \t\n]+"
            r"(?=[A-Z\"'“(])",
            re.MULTILINE,
        )
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
