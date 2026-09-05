"""Extract monologues from plain text plays using pattern matching."""

import re
import unicodedata
from typing import Dict, List, Optional

from app.services.extraction import speech_merge as _merge
from app.services.extraction.speech_merge import merge_interrupted_speeches
from app.services.extraction.monologue_quality import DEFAULT_MIN_WORDS


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

    #: Musical-number headings in ballad opera and light opera. `_ROMAN` alone
    #: does not catch these because the numeral has a word in front of it, so
    #: "AIR XXXVII." reads as a speaker called "Air Xxxvii". The Beggar's Opera
    #: is entirely built this way: a sweep of it produced 42 "monologues", every
    #: one a song lyric attributed to a roman numeral. Gilbert and Sullivan,
    #: Fielding and the 18th-century ballad operas all share the convention.
    _SONG_HEADING = re.compile(
        r"^(air|song|duet|trio|chorus|recitative|aria|glee|catch|ballad)"
        r"\s+([IVXLCDM]+|\d{1,3})\.?$", re.IGNORECASE)

    def __init__(self):
        pass

    def extract_monologues(
        self,
        text: str,
        min_words: int = DEFAULT_MIN_WORDS,
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

        # Pattern 5: a bare ALL-CAPS name alone on its line.
        #
        #     PHAEDRA                        <- Racine, indented
        #     THE BEECH                      <- Maeterlinck, at column 0
        #     TARTUFFE (after sitting down)  <- Moliere, with a direction
        #
        # No colon, no period, nothing for patterns 1 and 2 to anchor on, and
        # the wrong case for pattern 4. This is the single largest blind spot
        # measured: of 461 books a Gutenberg sweep read and got nothing from,
        # sampling put roughly five in eight here rather than at a legitimate
        # zero, and the losses include Phaedra and The Blue Bird.
        #
        # Confirmed by repetition like pattern 4, because one capitalised line
        # on its own is just as likely to be a title or an act heading. A name
        # that opens several speeches is a speaker.
        if len(speeches) < 5:
            cast = self._bare_caps_cast(text)
            if cast:
                speeches = self._split_on_bare_caps(text, cast)

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

        # Read the cast block once, not per speech. Empty for modern texts,
        # which spell their speakers out and need no expansion.
        cast = self._cast_list(text)

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
                    'character': self._expand_from_cast(
                        self._normalize_character_name(character), cast),
                    'text': display,
                    'dialogue': spoken,
                    'word_count': word_count,
                    'stage_directions': self._extract_stage_directions(speech_text)
                })

        return monologues

    #: The merge bounds live in `speech_merge` and are shared with the
    #: screenplay parser; re-exported here because tests and callers refer to
    #: them through the parser.
    MAX_INTERRUPTION_WORDS = _merge.MAX_INTERRUPTION_WORDS

    MAX_INTERRUPTIONS = _merge.MAX_INTERRUPTIONS

    MAX_INTERJECTION_SHARE = _merge.MAX_INTERJECTION_SHARE

    MIN_ANCHOR_WORDS = _merge.MIN_ANCHOR_WORDS

    #: A leading parenthetical this long is not a wrylie, it is the scene being
    #: described before anybody speaks. "(aside)" and "(drinks coffee and looks
    #: away)" are the actor's business and stay; twenty words of furniture and
    #: weather are the story being explained and go.
    SCENE_SETTING_WORDS = 20

    def _merge_interrupted_speeches(self, speeches: List[tuple]) -> List[tuple]:
        """Rejoin a speech that a short interruption split in two.

        The rule and its bounds live in `speech_merge`, shared with
        `screenplay_pdf_parser`: plays and screenplays lose speeches the same
        way, and two copies of the rule would drift.

        What differs is only how a body is reduced to the words said aloud —
        Gutenberg marks directions with italics and brackets, a screenplay with
        wrylies — so that is what gets passed in.
        """
        return merge_interrupted_speeches(
            speeches,
            spoken_of=lambda body: self._spoken_only(self._to_display(body)),
        )

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
        if self._SONG_HEADING.match(cleaned):
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

    #: The cast block, which older playtexts print before Act I. Anchored to a
    #: whole line so it does not fire on the word "characters" in a dedication,
    #: and tolerant of \r because Gutenberg files are CRLF -- a `$` anchor
    #: without `\r?` finds nothing at all in them.
    _CAST_HEADING = re.compile(
        r"^[ \t]*(?:DRAMATIS\s+PERSON(?:AE|Æ|A)|PERSONS\s+OF\s+THE\s+(?:PLAY|DRAMA)"
        r"|CHARACTERS(?:\s+OF\s+THE\s+PLAY)?|THE\s+PERSONS)[ \t.:Æ]*\r?$",
        re.MULTILINE | re.IGNORECASE)
    #: One cast line: the leading caps run, up to a comma or a column gap. A
    #: period must NOT end it, or "MRS. MARWOOD" is read as "MRS".
    _CAST_ENTRY = re.compile(r"^[ \t]*([A-Z][A-Z'’.\- ÆÈÉÀÔ]{1,42}?)\s*(?:,|\s{2,}|\r?$)")
    _CAST_SKIP = frozenset({"MEN", "WOMEN", "SCENE", "ACT", "THE END", "DANCERS",
                            "SERVANTS", "OTHERS", "ATTENDANTS"})

    def _cast_list(self, text: str) -> List[str]:
        """Full character names from the DRAMATIS PERSONAE block."""
        head = self._CAST_HEADING.search(text)
        if not head:
            return []
        block = text[head.end(): head.end() + 5000]
        stop = re.search(r"^[ \t]*(ACT\b|SCENE\b|PROLOGUE\b)", block,
                         re.MULTILINE | re.IGNORECASE)
        if stop:
            block = block[: stop.start()]
        names = []
        for line in block.splitlines():
            m = self._CAST_ENTRY.match(line)
            if not m:
                continue
            name = " ".join(m.group(1).replace(".", "").split())
            if (len(name) > 1 and name.upper() == name
                    and name not in self._CAST_SKIP
                    and not self._ROMAN.match(name)):
                names.append(name)
        return names

    @staticmethod
    def _name_tokens(value: str) -> List[str]:
        return [w.strip(".,;:'’") for w in value.split() if w.strip(".,;:'’")]

    @staticmethod
    def _fold(value: str) -> str:
        """Lowercase and strip accents, so a cue can match its own cast entry.

        Molière abbreviates CLÉANTHIS to "Cle." and Gutenberg keeps the accent
        in the cast list but not in the cue, so a plain startswith comparison
        fails on the one character whose name carries one. Same for ALCMÈNE,
        NAUCRATÈS, POSICLÈS -- French and Spanish drama is full of them.
        """
        decomposed = unicodedata.normalize("NFKD", value.lower())
        return "".join(c for c in decomposed if not unicodedata.combining(c))

    def _expand_from_cast(self, name: str, cast: List[str]) -> str:
        """Turn an abbreviated cue into the full name the cast list gives.

        Restoration and 18th-century texts abbreviate their speakers -- "Mira.",
        "Sir Wil.", "Mrs Mar.", "Foib." -- and storing those verbatim means an
        actor searching Millamant or Marwood finds nothing, and a character
        called "Lady" appears in the library. The Way of the World alone stored
        13 such names, and this is how every Congreve, Sheridan, Farquhar and
        Goldsmith text in the sweep is typeset.

        Positional prefix match first ("Sir Wil" -> "SIR WILFULL WITWOUD"), then
        a single-token fallback for cues that name the surname of a two-part
        entry ("Milla" -> "MRS MILLAMANT"). Ambiguity keeps the original: a wrong
        expansion is worse than an abbreviation, because it is not visibly wrong.
        """
        if not cast:
            return name
        cue = [self._fold(t) for t in self._name_tokens(name)]
        if not cue:
            return name
        hits = []
        for full in cast:
            tokens = [self._fold(t) for t in self._name_tokens(full)]
            if len(tokens) >= len(cue) and all(
                    tokens[i].startswith(cue[i]) for i in range(len(cue))):
                hits.append(full)
        if len(hits) != 1:
            exact = [h for h in hits if len(self._name_tokens(h)) == len(cue)]
            hits = exact if len(exact) == 1 else hits
        if len(hits) != 1 and len(cue) == 1:
            hits = [f for f in cast
                    if any(self._fold(t).startswith(cue[0])
                           for t in self._name_tokens(f))]
        if len(hits) == 1:
            return hits[0].title()
        return name

    #: A whole line that is nothing but an ALL-CAPS name, optionally carrying a
    #: parenthetical direction. `\r?$` because Gutenberg files are CRLF.
    _BARE_CAPS_CUE = re.compile(
        r"^[ \t]*([A-Z][A-Z '’\-\.]{1,38}?)"
        r"(?:[ \t]*\([^)\n]{0,90}\))?"
        r"[ \t]*\r?$", re.MULTILINE)

    def _bare_caps_cast(self, text: str) -> List[str]:
        """ALL-CAPS names that sit alone on a line and recur like speakers."""
        counts: Dict[str, int] = {}
        for match in self._BARE_CAPS_CUE.finditer(text):
            name = " ".join(match.group(1).split())
            counts[name] = counts.get(name, 0) + 1
        return [
            name
            for name, hits in counts.items()
            if hits >= self._MIN_CUE_REPEATS
            and self._is_plausible_character(name)
        ]

    def _split_on_bare_caps(self, text: str, cast: List[str]) -> List[tuple]:
        """Cut at each confirmed cue line; a speech runs to the next one."""
        allowed = {name.upper() for name in cast}
        cues = []
        for match in self._BARE_CAPS_CUE.finditer(text):
            name = " ".join(match.group(1).split())
            if name.upper() in allowed:
                cues.append((match.start(), match.end(), name))
        speeches = []
        for i, (_, end, name) in enumerate(cues):
            stop = cues[i + 1][0] if i + 1 < len(cues) else len(text)
            body = text[end:stop].strip()
            if body:
                speeches.append((name, body))
        return speeches

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
