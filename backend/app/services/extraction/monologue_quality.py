"""Deterministic quality gate for extracted monologues.

Runs at extraction time, BEFORE GPT selection or DB storage, and hard-rejects
anything that isn't a clean, continuous, single-speaker monologue. This is the
guarantee that scraped transcripts (especially noisy TV fan transcripts) never
leak interleaved dialogue, cue artifacts, scene headings, HTML/unicode junk, or
mid-sentence truncation into the library.

The film pipeline relies on IMSDb's <b>-tag HTML structure to keep speakers
separate; TV transcript sources have no such guarantee, so every candidate must
pass this gate regardless of source. Quality judgement ("is this audition
worthy?") still happens downstream via GPT — this gate is purely mechanical.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Word-count bounds. Floor keeps fragments out; ceiling matches the film
# pipeline's ~400-word audition excerpt target.
DEFAULT_MIN_WORDS = 40
DEFAULT_MAX_WORDS = 400

# A speaker label in transcript form: line begins with an ALL-CAPS name
# (2+ chars, allowing spaces / . ' -) immediately followed by a colon.
#   "MARIA:", "DR. REYES:", "OLD MAN:"
_SPEAKER_COLON = re.compile(r"(?m)^\s*[A-Z][A-Z0-9 .'’\-]{1,29}:")

# A bare speaker-cue line: the whole line is an ALL-CAPS name of 1-4 words with
# no terminal punctuation (screenplay style where the name sits on its own line).
_BARE_NAME_LINE = re.compile(
    r"(?m)^\s*[A-Z][A-Z'’.\-]*(?: [A-Z][A-Z'’.\-]*){0,3}\s*$"
)

# Screenplay continuation / off-screen markers that mean dialogue boundaries.
_SCREEN_MARKER = re.compile(r"\((?:CONT'D|CONT|V\.?O\.?|O\.?S\.?|O\.?C\.?)\)", re.I)

# Scene headings — anywhere, since PDF flattening drops line structure.
# Matches "INT."/"EXT." slugs and bare " - DAY/NIGHT/..." scene tails.
_SCENE_HEADING = re.compile(
    r"\b(?:INT|EXT)\.|\s[-–]\s(?:DAY|NIGHT|MORNING|EVENING|CONTINUOUS|LATER)\b"
)

# Screenplay character cues survive PDF flattening as bare ALL-CAPS names
# ("EMERSON It's...", "PEGGY I understand"). Two or more distinct 4+ letter
# all-caps tokens is a strong signal of cue/scene residue or interleaved speakers
# rather than one person's continuous speech.
_CAPS_WORD = re.compile(r"\b[A-Z]{4,}\b")
_CAPS_CUE_THRESHOLD = 2

# Editorial footnotes from scholarly Gutenberg editions open with a
# line/page citation: "2. 298. The metre of this line...", "4. 111-113. Mr
# Sidney Walker adopts Steevens' emendation". These are apparatus, not speech;
# a play extraction that hits the notes section must reject them, or a search
# returns a footnote where a monologue should be.
_FOOTNOTE_CITATION = re.compile(r"^\s*\d+\.\s*\d+[.,\s-]")

# Square-bracket cues: [LAUGHTER], [APPLAUSE], [MUSIC PLAYING], [SIGHS].
_BRACKET_CUE = re.compile(r"\[[^\]]*\]")

# Any parenthetical (routed to a screen-marker reason or a stage-direction reason).
_PARENTHETICAL = re.compile(r"\([^)]*\)")

# HTML tags or entities left in the text.
_HTML_RESIDUE = re.compile(r"<[^>]+>|&[a-zA-Z]+;|&#\d+;")

# Stray "+" join artifacts from PDF/segment merging: "cold- + blooded",
# "the force, so... + Do I?". Never legitimate inside spoken prose.
_JOIN_ARTIFACT = re.compile(r"\S\s\+\s\S|[A-Za-z]\+[A-Za-z]")

# Lowercase screenplay narration that survives as prose: a capitalised subject
# (a name, or He/She/They/It) immediately followed by a present-tense physical
# action verb — "He looks at the pills", "Truman nods", "Banquo smiles upon me".
# This is the residue of screenplay action lines merged into a character's
# speech. Classical verse legitimately uses third-person constructions of this
# shape ("Love looks not with the eyes"), so this check is OPT-IN via
# ``check_narration`` and only enabled for film/TV sources by the repair pipeline.
_NARRATION_VERB = (
    "sees|smiles|nods|looks|turns|stares|frowns|shrugs|glances|enters|exits|"
    "stands|sits|walks|steps|pauses|crosses|grabs|pulls|opens|closes|watches|"
    "moves|reaches|leans|gestures|gazes|points|laughs|sighs|rises|kneels|stops|"
    "drops|lifts|raises|holds|picks|waves|hands|stares|whispers|shouts|screams|"
    # Added after #11309 (Heathers) and #9715 (Coco) slipped through with whole
    # action paragraphs inside the dialogue.
    "crawls|hangs|wriggles|reveals|tunes|sucks|begins|climbs|slides|throws|"
    "takes|puts|sets|carries|pushes|runs|jumps|kicks|slams|tosses|wipes"
)
# Two shapes of subject. Title-Case ("Truman nods") is the prose form; ALL-CAPS
# ("VERONICA hangs up") is how screenplays actually write character names in
# action lines, and the original pattern could not see it at all — which is why
# Heathers kept an entire stage-action paragraph in the middle of a monologue.
# ALL-CAPS is also the safer half: classical verse never shouts a name mid-line,
# so it cannot produce the false positives this check is opt-in to avoid.
_NARRATION = re.compile(
    r"\b(?:[A-Z][a-z]+|[A-Z]{2,})\s+(?:" + _NARRATION_VERB + r")\b"
)


def has_narration(text: str) -> bool:
    """True if ``text`` contains a screenplay-narration sentence (see _NARRATION)."""
    return bool(_NARRATION.search(text or ""))


# --- co-character interleave (cast-aware) ----------------------------------
#
# The checks above are all format-based: they look for a colon, a bare CAPS
# line, a bracket cue. A play text that has already been normalised into flowing
# prose defeats every one of them, because another character's line reads as an
# ordinary sentence and the cue survives only as "Name." mid-paragraph.
#
# That is the #7521 class, and it is why `clean_interleaved_dialogue.py` had to
# exist as a post-hoc repair: contaminated rows PASSED this gate (grammatical,
# in-range word count, no artifacts) and only a human reading them noticed.
#
# These checks need something the format checks don't: the play's cast list. Ask
# for it and the gate catches the problem at extraction instead of in prod.

# A stage direction welded into the body. Anchored to a leading capital and kept
# short so it cannot swallow a spoken sentence ("Enter the room, close the door,
# and listen to me." is 10+ words and is not matched).
_STAGE_DIRECTION = re.compile(
    r"(?<![\w'’])(?:Re-enter|Enter|Exeunt|Exit)\b(?:\s+[A-Z][^.!?;]{0,55})?[.!?;]",
)

# First-person speech inside a would-be stage direction means it is really a
# line: "Enter my house and I'll show you" stays, "Enter Rosencrantz." goes.
_FIRST_PERSON = re.compile(r"\b(?:I|I'|me|my|mine|we|us|our)\b")

# Small words allowed inside a capitalised speaker label ("The Sentimental High
# School Girl", "Duke of Vienna").
_LABEL_CONNECTORS = frozenset({
    "the", "a", "an", "of", "and", "de", "la", "le", "young", "old",
})


def _distinctive(name: str) -> bool:
    """Would this co-character name, used as ``Name.``, be a real speaker cue?

    Multi-word or long names ("The Vivacious Girl", "Rosencrantz") are cues.
    Short single names ("Tracy", "Oliver") are excluded — they appear whenever a
    character simply addresses another, and would fire constantly.
    """
    n = (name or "").strip()
    if not n:
        return False
    return len(n.split()) >= 2 or len(n) >= 8


def _cue_pattern(name: str) -> re.Pattern:
    """``Name.`` or ``Name:`` as a speaker cue, at a sentence boundary.

    The boundary is the whole discriminator. A character naming another
    character reads identically to a cue on its own —

        "I'm every doubt you've ever had, Sherlock."     <- direct address
        "...live they still or live they not. IPHIGENIA . Listen!"  <- a cue

    — and the only difference is what comes before the name: a comma (or any
    mid-sentence word) means someone is being spoken TO, while a full stop means
    a new speaker is starting. Without this, Moriarty addressing Sherlock,
    Agent Smith addressing Morpheus and Oberon addressing Robin all read as
    interleaved dialogue.
    """
    return re.compile(
        r"(?:(?<=[.!?])|^)\s*" + re.escape(name.strip()) + r"\s*[.:]",
        re.IGNORECASE | re.MULTILINE,
    )


def _is_speaker_label(clause: str, cast: list[str]) -> bool:
    """Is this clause a speaker label rather than words somebody speaks?

    A label is short, ends on (or equals) a cast name, and is entirely
    capitalised bar small connectors. This is what distinguishes the full cue
    "The Sentimental High School Girl" — a superset of the cast name "High
    School Girl" — from a spoken line that merely names another character.
    """
    core = clause.strip().rstrip(".:").strip()
    if not core or len(core.split()) > 8:
        return False
    cl = core.lower()
    if not any(cl == n.lower() or cl.endswith(" " + n.lower()) for n in cast):
        return False
    for w in core.split():
        if (
            w[:1].isalpha()
            and not w[:1].isupper()
            and w.lower().strip(",") not in _LABEL_CONNECTORS
        ):
            return False
    return True


def has_interleaved_dialogue(text: str, cast: list[str]) -> bool:
    """True if another character's speaker cue appears inside ``text``.

    ``cast`` is the co-characters of the play, NOT including the speaker. Only
    distinctive names are considered (see :func:`_distinctive`).
    """
    others = [n for n in (cast or []) if _distinctive(n)]
    if not others:
        return False

    body = (text or "").strip()
    for name in others:
        m = _cue_pattern(name).search(body)
        # A cue at the very start is the speech opening by addressing someone
        # ("Horatio: thou art e'en as just a man") — not an interleave.
        if m and m.start() > 3:
            return True

    # A cue label stranded as the final sentence, which is what a naive
    # paragraph join leaves behind.
    parts = re.split(r"(?<=[.!?])\s+", body)
    if len(parts) >= 2 and _is_speaker_label(parts[-1], others):
        return True

    return False


# --- flattened dialogue scenes ---------------------------------------------
#
# A third failure class, distinct from the two above and invisible to both. Some
# film rows are a whole two-person scene collapsed into one "monologue": the
# other character's lines were removed and what remained was concatenated, often
# out of order. #9750 (Joker) runs backwards through the Murray interview —
# "thanks for having me on" sits after the knock-knock that ends it.
#
# Nothing else catches it. The text is single-speaker, grammatical, in range and
# artifact-free, so it passes every check including the cast-aware ones.
#
# The tell is a blank-line gap (where the other character was cut out) followed
# by a fragment that ANSWERS something no longer present: "Yeah, ...",
# "You're right...", "No, don't do that.". A real monologue does not contain
# answers to absent questions.
#
# Fragment count alone is NOT the signal — Sling Blade, Gladiator, Apocalypse
# Now and Tony Stark's recording in Endgame all run to 4+ paragraphs and are
# perfectly good. Both conditions are required.
_MIN_FRAGMENTS_FOR_SCENE = 4
_REPLY_OPENER = re.compile(
    r"^\s*(?:yeah|yes|no|nope|well|okay|ok|sure|right|you'?re right|i know|"
    r"thanks|thank you|uh|um|oh|exactly|of course|i guess|maybe)\b",
    re.I,
)


def has_flattened_scene(text: str) -> bool:
    """True if ``text`` looks like a dialogue scene flattened into one speech."""
    frags = [f for f in re.split(r"\n\s*\n", text or "") if f.strip()]
    if len(frags) < _MIN_FRAGMENTS_FOR_SCENE:
        return False
    # frags[1:] on purpose. The signal is an answer sitting AFTER a gap where the
    # other character's line was removed. A speech's own opening may legitimately
    # begin "Of course," or "Well," — it is answering something in the scene that
    # was never part of this monologue. Notting Hill's opening voiceover starts
    # "Of course, I've seen her films" and is five clean paragraphs of one man
    # talking; counting the first fragment condemned it.
    return any(_REPLY_OPENER.match(f) for f in frags[1:])


def has_stage_direction_residue(text: str, cast: list[str]) -> bool:
    """True if an ``Enter/Exit/Exeunt`` direction is welded into ``text``."""
    cast_l = {c.lower() for c in (cast or [])}
    for m in _STAGE_DIRECTION.finditer(text or ""):
        span = m.group(0)
        if _FIRST_PERSON.search(span) or len(span.split()) > 7:
            continue  # reads as speech, not a cue
        head = span.split()[0].lower()
        if head in ("enter", "re-enter"):
            tail = " ".join(span.split()[1:]).rstrip(".!?;:").strip().lower()
            # "Enter <someone>" only counts when it names a cast member.
            if tail and not any(
                tail.startswith(c) or c.startswith(tail) for c in cast_l
            ):
                continue
        return True
    return False

# Trailing closing quotes / brackets to peel before checking terminal punctuation.
_TRAILING_CLOSERS = "\"'”’)]}"

_TERMINAL_PUNCT = ".!?"


_CID = re.compile(r"\(cid:\d+\)")

# Revision marks from a shooting script's right margin. Production drafts print
# an asterisk beside every changed line; x-position flattening pulls it into the
# sentence, so Joker's speech arrives as "Do you ever actually * leave the
# studio?". Same family as _JOIN_ARTIFACT — never meaningful inside dialogue.
# Anchored to whitespace boundaries so an in-word asterisk is left alone.
_REVISION_MARK = re.compile(r"(?:(?<=\s)|^)\*+(?=\s|$)", re.M)


def strip_revision_marks(text: str) -> str:
    """Remove margin revision marks ONLY, leaving all other formatting alone.

    Split out from :func:`to_display_text` so a retroactive cleanup can fix the
    marks on already-stored rows without also applying that function's other
    normalisations — in particular its whitespace collapse, which would flatten
    the paragraph breaks of every legitimate multi-paragraph monologue in the
    library.
    """
    raw = text or ""
    if not _REVISION_MARK.search(raw):
        return raw          # strict no-op: never touch text that has no mark
    t = _REVISION_MARK.sub(" ", raw)
    # Only tidy the spaces the removal itself created; newlines are preserved.
    t = re.sub(r"[ \t]{2,}", " ", t)
    return re.sub(r"[ \t]+([,.;:!?])", r"\1", t).strip()


def to_display_text(text: str) -> str:
    """Clean a monologue for storage while KEEPING stage directions as `(...)`.

    Stage directions are preserved (not deleted) so the UI can render them as
    italic muted parentheticals — the actor sees them as directions, not lines.
    `[...]` cues are normalised to `(...)`; broken-font `(cid:NN)` tokens, control
    chars, and the unicode replacement char are removed; whitespace is tidied.
    """
    t = _CID.sub("", text or "")
    t = t.replace("[", "(").replace("]", ")")          # bracket cues -> parens
    t = t.replace("�", "")                         # mojibake replacement char
    t = "".join(c for c in t if c == "\n" or ord(c) >= 32)  # drop control chars
    t = _REVISION_MARK.sub(" ", t)                      # shooting-script margin marks
    t = re.sub(r"\(\s*\)", " ", t)                      # empty parens left by cid removal
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def strip_artifacts(text: str) -> str:
    """Conservatively remove stage-direction artifacts from a monologue.

    Drops `[...]` cues and `(...)` parentheticals (wrylies, beats, and the
    occasional other-character aside) and collapses whitespace. This is the
    high-confidence auto-clean: it cannot fix structurally broken text
    (interleaved bare-name cues, scene headings, truncation) — those are routed
    to manual review by the caller, not silently mangled.
    """
    t = _BRACKET_CUE.sub(" ", text or "")
    t = _PARENTHETICAL.sub(" ", t)
    # tidy spacing left by removals, including space before punctuation
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


@dataclass
class QualityResult:
    ok: bool
    word_count: int
    reasons: list[str] = field(default_factory=list)


def _has_weird_chars(text: str) -> bool:
    for ch in text:
        if ch == "�":  # unicode replacement char — mojibake / decode failure
            return True
        if ord(ch) < 32 and ch not in "\n\r\t":  # control chars
            return True
    return False


def assess_monologue_quality(
    text: str,
    *,
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: int = DEFAULT_MAX_WORDS,
    check_narration: bool = False,
    cast: list[str] | None = None,
) -> QualityResult:
    """Assess whether ``text`` is a clean single-speaker monologue.

    Returns a :class:`QualityResult`; ``ok`` is True only when ``reasons`` is
    empty. Collecting all reasons (rather than failing fast) makes rejected
    extractions easy to audit and the gate easy to tune.

    ``cast`` is the play's other characters (excluding the speaker). Pass it
    whenever it is known: the format-based checks cannot see a co-character cue
    that has been normalised into prose, and that is the failure mode that put
    296 contaminated rows into the library. Without it the gate still works,
    just blind to that one class.
    """
    reasons: list[str] = []
    raw = text or ""
    stripped = raw.strip()

    word_count = len(stripped.split())

    if not stripped:
        return QualityResult(ok=False, word_count=0, reasons=["empty"])

    # --- length ---
    if word_count < min_words:
        reasons.append("too_short")
    elif word_count > max_words:
        reasons.append("too_long")

    # --- single-speaker continuity ---
    parentheticals = _PARENTHETICAL.findall(raw)
    has_screen_marker = any(_SCREEN_MARKER.search(p) for p in parentheticals)
    if _SPEAKER_COLON.search(raw) or has_screen_marker:
        reasons.append("interleaved_speaker")
    elif raw.strip().count("\n") > 0 and _BARE_NAME_LINE.search(raw):
        # A bare ALL-CAPS name line only counts as a speaker break when the text
        # actually spans multiple lines (a single all-caps line is handled by the
        # length / shouty checks, not treated as a label here).
        reasons.append("interleaved_speaker")

    # --- artifacts ---
    if _BRACKET_CUE.search(raw):
        reasons.append("bracket_cue")

    # Parentheticals that are NOT screen markers are stage directions: (beat),
    # (laughs), (sighing). Screen markers already counted as interleaved above.
    if any(not _SCREEN_MARKER.search(p) for p in parentheticals):
        reasons.append("parenthetical_direction")

    if _SCENE_HEADING.search(raw):
        reasons.append("scene_heading")

    if _FOOTNOTE_CITATION.match(stripped):
        reasons.append("footnote_citation")

    if len(set(_CAPS_WORD.findall(raw))) >= _CAPS_CUE_THRESHOLD:
        reasons.append("caps_residue")

    if _HTML_RESIDUE.search(raw):
        reasons.append("html_residue")

    if _has_weird_chars(raw):
        reasons.append("weird_chars")

    if _JOIN_ARTIFACT.search(raw):
        reasons.append("join_artifact")

    # Lowercase screenplay-narration residue (film/TV only — see _NARRATION).
    if check_narration and _NARRATION.search(raw):
        reasons.append("narration")

    # A dialogue scene flattened into one speech. Needs no cast list — the
    # orphaned answers give it away on their own.
    if has_flattened_scene(raw):
        reasons.append("flattened_scene")

    # Cast-aware interleave — the checks that need to know who else is in the
    # play. Only run when a cast list was supplied.
    if cast:
        if has_interleaved_dialogue(raw, cast):
            reasons.append("interleaved_dialogue")
        if has_stage_direction_residue(raw, cast):
            reasons.append("stage_direction_residue")

    # --- truncation ---
    tail = stripped.rstrip(_TRAILING_CLOSERS).rstrip()
    if not tail or tail[-1] not in _TERMINAL_PUNCT:
        reasons.append("truncated_end")

    # de-dupe while preserving order
    seen: set[str] = set()
    ordered = [r for r in reasons if not (r in seen or seen.add(r))]
    return QualityResult(ok=not ordered, word_count=word_count, reasons=ordered)
