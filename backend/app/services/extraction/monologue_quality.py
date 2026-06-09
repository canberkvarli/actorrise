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
    "drops|lifts|raises|holds|picks|waves|hands|stares|whispers|shouts|screams"
)
_NARRATION = re.compile(r"\b[A-Z][a-z]+\s+(?:" + _NARRATION_VERB + r")\b")


def has_narration(text: str) -> bool:
    """True if ``text`` contains a screenplay-narration sentence (see _NARRATION)."""
    return bool(_NARRATION.search(text or ""))

# Trailing closing quotes / brackets to peel before checking terminal punctuation.
_TRAILING_CLOSERS = "\"'”’)]}"

_TERMINAL_PUNCT = ".!?"


_CID = re.compile(r"\(cid:\d+\)")


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
) -> QualityResult:
    """Assess whether ``text`` is a clean single-speaker monologue.

    Returns a :class:`QualityResult`; ``ok`` is True only when ``reasons`` is
    empty. Collecting all reasons (rather than failing fast) makes rejected
    extractions easy to audit and the gate easy to tune.
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

    # --- truncation ---
    tail = stripped.rstrip(_TRAILING_CLOSERS).rstrip()
    if not tail or tail[-1] not in _TERMINAL_PUNCT:
        reasons.append("truncated_end")

    # de-dupe while preserving order
    seen: set[str] = set()
    ordered = [r for r in reasons if not (r in seen or seen.add(r))]
    return QualityResult(ok=not ordered, word_count=word_count, reasons=ordered)
