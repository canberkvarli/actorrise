"""Screenplay-aware PDF parser for teleplay / film scripts.

Standard screenplay PDFs encode structure as horizontal indentation:
  - action / description  ~1.5" from left
  - dialogue              ~2.5"
  - parenthetical wrylies ~3.0"
  - CHARACTER cue         ~3.7" (centered, ALL CAPS)
  - scene numbers         far left margin

The old `plain_text_parser` flattened this and mislabelled scene/action as
"characters". This parser keeps the x-position of each line and segments by band,
so a monologue is the continuous run of dialogue under a single CHARACTER cue —
guaranteeing single-speaker continuity by construction.

PDFs with broken/subsetted fonts (text extracts as `(cid:NN)`) are detected and
skipped — they need OCR, which is out of scope here.

Not every PDF behind a script URL is a formatted screenplay. Scans with no text
layer, documents with no indentation, and layouts whose cue and dialogue
columns coincide all used to return an empty list — indistinguishable from a
script that simply had no long speeches. Roughly a quarter of a sample of
well-known films hit one of those. Use `extract_with_status()` for bulk work:
it names the failure instead of returning nothing.
"""

from __future__ import annotations

import collections
import re

from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    strip_artifacts,
    to_display_text,
)
from app.services.extraction.speech_merge import merge_interrupted_speeches
from app.services.extraction.monologue_quality import DEFAULT_MIN_WORDS

_PAREN = re.compile(r"\([^)]*\)")

# A cue carrying one of these markers is the same character continuing a speech
# a page break or action beat split in two — the screenwriter's own "this is
# still one speech" signal. Matched against the RAW cue, before the parentheses
# are stripped by _clean_cue_name. The apostrophe class covers both the straight
# (') and curly (’) forms: scripts overwhelmingly typeset "CONT’D" with the
# curly quote, and matching only the straight one silently disabled the merge on
# every such script (The Whale, whose whole opening is one Charlie lecture).
_CONTD = re.compile(r"\bcont['’]?d\b|\bcontinued\b|\(\s*more\s*\)", re.I)

# A real screenplay PDF has a text layer of this order. Below it we are looking
# at a scan, not a script — see the note on cid_ratio() for why that is not
# self-evident from the text alone.
_MIN_TEXT_LINES = 200
_MIN_TEXT_WORDS = 500

# Cue columns sit around 3.7" (x0 ~250-330 at these scales). A "cue band" near
# the left margin means the PDF carries no indentation at all, so the band model
# cannot work — 12 Angry Men detects a band of 18 and derives a dialogue window
# of -92..-2, which nothing can satisfy.
_MIN_PLAUSIBLE_CUE_BAND = 100


def looks_like_cue(text: str) -> bool:
    """True if a line is a CHARACTER cue: short, ALL-CAPS once (V.O.)/(CONT'D) is dropped."""
    t = _PAREN.sub("", text).strip()
    if not (2 <= len(t) <= 32) or len(t.split()) > 4:
        return False
    letters = [c for c in t if c.isalpha()]
    if not letters:
        return False
    return sum(c.isupper() for c in letters) / len(letters) >= 0.9


def _clean_cue_name(text: str) -> str:
    # str.title() capitalises the letter after an apostrophe, turning the cue
    # "ELLIOT'S THOUGHTS" into "Elliot'S Thoughts" — which is what the actor
    # would then see as the character name.
    t = _PAREN.sub("", text).strip().title()
    return re.sub(r"'(\w)", lambda m: "'" + m.group(1).lower(), t)


def _line_is_doubled(text: str) -> bool:
    """True when a line is uniformly glyph-doubled ("TThhiiss" / "GGLLOORRIIAA").

    A ScriptSlug PDF vintage draws some type double-struck, so every glyph
    extracts twice. Detection sits at a 0.9 matched-pair ratio: a correctly
    spelled double letter never reaches it, uniform doubling always does.
    """
    s = re.sub(r"[^a-z]", "", text.lower())
    if len(s) < 6:
        return False
    pairs = len(s) // 2
    return sum(1 for i in range(0, 2 * pairs, 2) if s[i] == s[i + 1]) / pairs >= 0.9


def _dedouble(text: str) -> str:
    """Fold each adjacent identical pair in half (case-insensitive).

    Reverses uniform glyph doubling losslessly: "CCOONNTT'DD" -> "CONT'D", so the
    cue reads and the (CONT'D) merge fires; a genuine double ("tt") survives
    because it was itself doubled to four.
    """
    out = []
    i = 0
    n = len(text)
    while i < n:
        out.append(text[i])
        if i + 1 < n and text[i + 1].lower() == text[i].lower():
            i += 2
        else:
            i += 1
    return "".join(out)


def _dedouble_lines(lines):
    """De-double any line the doubling artifact hit, leaving the rest untouched.

    Run once before segmentation so a double-struck script is parsed as if it
    had extracted cleanly — the cue names, the (CONT'D) markers and the dialogue
    all come out single-struck. Fixes the artifact at ingest instead of leaving
    it for a later repair pass, and a normal script is unchanged (no line clears
    the 0.9 bar).
    """
    return [(x, _dedouble(t) if t and _line_is_doubled(t) else t) for x, t in lines]


def segment_screenplay(lines, min_words: int = DEFAULT_MIN_WORDS, max_words: int = 400):
    """Segment indented screenplay lines into single-speaker monologues.

    ``lines`` is an ordered list of ``(x0, text)`` tuples; a ``(None, None)``
    entry marks a page break (which closes the current speech). Returns a list of
    ``{character, text, word_count}`` dicts for blocks within the word bounds.
    """
    # detect the CHARACTER-cue band (the x0 most cue-like lines sit at)
    cue_hist = collections.Counter(
        round(x0 / 6) * 6 for x0, t in lines if t and looks_like_cue(t)
    )
    if not cue_hist:
        return []
    cue_band = cue_hist.most_common(1)[0][0]
    if cue_band < _MIN_PLAUSIBLE_CUE_BAND:
        # Unindented document: the band model has nothing to work with, and the
        # fixed offsets below would produce a negative window.
        return []

    # Derive the dialogue band from where non-cue lines actually sit, rather
    # than assuming a fixed offset from the cue. Scripts whose cue and dialogue
    # indents nearly coincide (Good Will Hunting: cue 306, dialogue ~300) fall
    # outside a hardcoded -110/-20 window and yield almost nothing.
    dlg_hist = collections.Counter(
        round(x0 / 6) * 6
        for x0, t in lines
        if t and not looks_like_cue(t) and cue_band - 130 <= x0 <= cue_band - 2
    )
    if dlg_hist:
        dlg_mode = dlg_hist.most_common(1)[0][0]
        dlg_lo, dlg_hi = dlg_mode - 30, dlg_mode + 45  # wrylies sit right of dialogue
    else:
        dlg_lo, dlg_hi = cue_band - 110, cue_band - 20
    if dlg_lo <= 0:
        return []

    # Every speech the layout yields, in order, BEFORE any judgement. The word
    # floor cannot be applied here: whether a block clears it depends on whether
    # the block that follows is really a continuation of it, which is not known
    # until the whole script has been read.
    blocks: list[tuple[str, str]] = []
    # cur_char owns whatever is in buf. It is retained across an action beat or
    # page break (which only set active=False), so a following "(CONT'D)" re-cue
    # can recognise the same speaker and resume. `active` is whether dialogue is
    # live right now, as opposed to interrupted and awaiting a continuation.
    cur_char: str | None = None
    buf: list[str] = []
    active = False

    def flush():
        nonlocal cur_char, buf, active
        if cur_char and buf:
            blocks.append((cur_char, " ".join(buf)))
        buf = []
        cur_char = None
        active = False

    for x0, t in lines:
        if t is None:                       # page break — interrupt, keep buf
            active = False
            continue
        band = round(x0 / 6) * 6
        if looks_like_cue(t) and abs(band - cue_band) <= 12:
            name = _clean_cue_name(t)
            # Same character + a (CONT'D)/(MORE) marker = one continuous speech
            # the layout split. Keep accumulating rather than emitting the
            # truncated fragment and starting over (The Whale's opening is one
            # Charlie lecture broken across a dozen "CHARLIE (V.O.) (CONT'D)"
            # cues; every fragment fell under the word floor and was lost).
            if buf and name == cur_char and _CONTD.search(t):
                active = True
                continue
            flush()
            cur_char = name
            active = True
            continue
        if not active:                      # between speeches or interrupted:
            continue                        # ignore action and any orphan dialogue
        if x0 <= cue_band - 130:            # action / scene heading — interrupt, keep buf
            active = False
        elif dlg_lo <= x0 <= dlg_hi:        # dialogue (wrylies stripped later)
            buf.append(t)
        # lines outside these bands are ignored without breaking the speech
    flush()

    # A speech someone briefly interrupted is still one speech. The (CONT'D)
    # merge above only rejoins a speech the LAYOUT split — a page break, an
    # action beat — and the screenwriter marked as continuing. It cannot see the
    # commonest split of all: another character says one line back.
    #
    # That gap has a measurable shape. Of 2,746 film and TV pieces deleted at
    # the 75-word floor, 74% were 55-74 words, median 59, and not one was under
    # 40. A corpus does not pile up just beneath a bar by accident; that is what
    # it looks like when speeches are being cut in half.
    #
    # Same rule as the play parser, TIGHTER bounds — screen dialogue alternates
    # far faster than stage dialogue, so the play defaults (2 interruptions, a
    # 40-word anchor) merge conversations here. Measured on five scripts:
    #
    #   no merge                     29 kept
    #   play defaults                55 kept  (+90%, but Fight Club's Jack and
    #                                          Bob arrive as one "monologue")
    #   1 interruption, 60-word anchor   36 kept  (+24%, and what comes out is
    #                                          Tyler's Raymond K. Hessel speech,
    #                                          Will's Harvard bar speech, Sean's
    #                                          lecture — actual monologues)
    #
    # The anchor is the lever that matters: it demands a nearly-complete speech
    # was split, rather than letting three short replies stitch together.
    blocks_merged = merge_interrupted_speeches(
        blocks,
        spoken_of=lambda raw: strip_artifacts(to_display_text(raw)),
        max_interruptions=1,
        min_anchor_words=60,
    )

    monos: list[dict] = []
    for character, raw in blocks_merged:
        display = to_display_text(raw)      # keeps (stage directions)
        dialogue = strip_artifacts(display)  # spoken lines only
        wc = len(dialogue.split())
        # Length is judged on what is SPOKEN, artifacts on what is WRITTEN.
        # Handing the gate only the stripped text left it no parentheses to
        # count, so `direction_heavy` could never fire on this path.
        if min_words <= wc <= max_words and assess_monologue_quality(
            display, spoken=dialogue, min_words=min_words, max_words=max_words
        ).ok:
            monos.append({
                "character": character,
                "text": display,
                "dialogue": dialogue,
                "word_count": wc,
            })
    return monos


def cid_ratio(lines) -> float:
    """Fraction of `(cid:` tokens — high means a broken font (needs OCR)."""
    txt = " ".join(t for _, t in lines if t)
    toks = txt.split()
    return txt.count("(cid:") / max(len(toks), 1)


def lines_from_pdf(path: str, max_pages: int = 200):
    """Extract ordered (x0, text) lines from a PDF, with (None, None) page breaks."""
    import pdfplumber

    out = []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages[:max_pages]:
            byline: dict[int, list] = {}
            for w in pg.extract_words():
                byline.setdefault(round(w["top"] / 3), []).append(w)
            for key in sorted(byline):
                ws = byline[key]
                x0 = min(w["x0"] for w in ws)
                text = " ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"]))
                out.append((x0, text))
            out.append((None, None))
    return out


def extract_with_status(path: str, min_words: int = DEFAULT_MIN_WORDS, max_words: int = 400):
    """Full path, returning ``(monologues, status)``.

    Status is the point of this function. Every failure mode below used to
    return a bare ``[]``, which is the same value a well-parsed script with no
    long speeches returns — so a bulk run could skip a quarter of its input and
    look like a success. Statuses:

      ok / no_monologues   parsed fine (the latter simply had none in range)
      no_text_layer        scanned PDF, nothing extractable — needs OCR
      needs_ocr            broken/subsetted fonts, text comes out as (cid:NN)
      not_screenplay_layout  no cue column, or one at the left margin
    """
    lines = _dedouble_lines(lines_from_pdf(path))
    text_lines = [(x, t) for x, t in lines if t]
    words = sum(len(t.split()) for _, t in text_lines)

    # Checked BEFORE cid_ratio: with no text at all, cid_ratio is 0/1 = 0.0,
    # i.e. it reports a perfect score for a pure image and the OCR guard below
    # never fires. A 5 MB scan of Moonlight looked identical to a clean script.
    if len(text_lines) < _MIN_TEXT_LINES or words < _MIN_TEXT_WORDS:
        return [], "no_text_layer"

    if cid_ratio(lines) > 0.05:
        return [], "needs_ocr"

    monos = segment_screenplay(lines, min_words, max_words)
    if monos:
        return monos, "ok"
    # segment_screenplay() returns [] both for "no cue column found" and for
    # "found one but nothing in range"; separate them so the first is reported
    # as a parse failure rather than an empty script.
    cue_hist = collections.Counter(
        round(x0 / 6) * 6 for x0, t in lines if t and looks_like_cue(t)
    )
    if not cue_hist or cue_hist.most_common(1)[0][0] < _MIN_PLAUSIBLE_CUE_BAND:
        return [], "not_screenplay_layout"
    return [], "no_monologues"


def extract_screenplay_monologues(path: str, min_words: int = DEFAULT_MIN_WORDS, max_words: int = 400):
    """Full path: PDF -> lines -> (skip if unusable) -> single-speaker monologues.

    Kept for existing callers. Prefer extract_with_status() for anything doing
    bulk ingest, so failures are counted instead of silently dropped.
    """
    return extract_with_status(path, min_words, max_words)[0]
