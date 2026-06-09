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
"""

from __future__ import annotations

import collections
import re

from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    strip_artifacts,
    to_display_text,
)

_PAREN = re.compile(r"\([^)]*\)")


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
    return _PAREN.sub("", text).strip().title()


def segment_screenplay(lines, min_words: int = 40, max_words: int = 400):
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
    dlg_lo, dlg_hi = cue_band - 110, cue_band - 20  # dialogue + wrylies sit here

    monos: list[dict] = []
    cur_char: str | None = None
    buf: list[str] = []

    def flush():
        nonlocal cur_char, buf
        if cur_char and buf:
            display = to_display_text(" ".join(buf))   # keeps (stage directions)
            dialogue = strip_artifacts(display)         # spoken lines only
            wc = len(dialogue.split())
            # Validate the SPOKEN dialogue (single-speaker, clean, in range); store
            # the display text with directions preserved for italic rendering.
            if min_words <= wc <= max_words and assess_monologue_quality(dialogue).ok:
                monos.append({
                    "character": cur_char,
                    "text": display,
                    "dialogue": dialogue,
                    "word_count": wc,
                })
        buf = []

    for x0, t in lines:
        if t is None:                       # page break
            flush(); cur_char = None
            continue
        band = round(x0 / 6) * 6
        if looks_like_cue(t) and abs(band - cue_band) <= 12:
            flush()
            cur_char = _clean_cue_name(t)
            continue
        if cur_char is None:
            continue
        if x0 <= cue_band - 130:            # action / scene heading at left margin
            flush(); cur_char = None
        elif dlg_lo <= x0 <= dlg_hi:        # dialogue (wrylies stripped later)
            buf.append(t)
        # lines outside these bands are ignored without breaking the speech
    flush()
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


def extract_screenplay_monologues(path: str, min_words: int = 40, max_words: int = 400):
    """Full path: PDF -> lines -> (skip if cid-garbage) -> single-speaker monologues."""
    lines = lines_from_pdf(path)
    if cid_ratio(lines) > 0.05:
        return []
    return segment_screenplay(lines, min_words, max_words)
