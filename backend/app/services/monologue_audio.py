"""The voice that reads a monologue to the actor before they say it back.

"Hear it" is the first half of a run from the piece page: the piece is read
aloud, line by line, then the lines hide and the actor says it. The audio comes
from the same permanent cache ScenePartner's partner lines use
(services/rehearsal/partner_audio.py), keyed on vendor + voice + text, so a
library piece is synthesised once and every later actor pays nothing.

The browser sends the lines, because the browser is what splits a piece into
lines (lib/lineMatching.ts toDeliverableLines) and the two must agree to the
character. The server never trusts that text: a line is synthesised only if it
is a stretch of the piece itself. Without that check this route would be a free
text-to-speech service for anyone with an account.

The read is neutral on purpose (no direction). It is there so the actor hears
the words, not so a voice hands them a line reading to copy.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.rehearsal.voices import VOICES, Voice

# A long piece runs to about 40 sentences; 80 leaves room without letting one
# call queue a book.
MAX_LINES = 80
MAX_LINE_CHARS = 800


def clean_line(text: str) -> str:
    """Mirror of toDeliverableLines' cleaning: bracketed asides out, whitespace
    collapsed. Case and punctuation are kept, so a line has to be the piece's
    own words in the piece's own order."""
    text = re.sub(r"\[([^\]]+)\]", "", text or "")
    return re.sub(r"\s+", " ", text).strip()


def source_text(text: str | None, text_segments: Any) -> str:
    """What the browser splits into lines: the dialogue segments joined, or the
    whole text when there are none. Same choice as linesFromMonologue in
    MonologueCueing.tsx."""
    dialogue = ""
    if isinstance(text_segments, list):
        dialogue = " ".join(
            str(s.get("text") or "")
            for s in text_segments
            if isinstance(s, dict) and s.get("type") == "dialogue"
        ).strip()
    return clean_line(dialogue or text or "")


def lines_belong(lines: list[str], source: str) -> bool:
    """True when every line is a non-empty stretch of `source`."""
    if not lines or len(lines) > MAX_LINES or not source:
        return False
    for line in lines:
        clean = clean_line(line)
        if not clean or len(clean) > MAX_LINE_CHARS or clean not in source:
            return False
    return True


def voice_for(gender: str | None) -> Voice:
    """A man's piece in a man's voice, everything else in a woman's. The list
    is the partner voice list, so the vendor setting moves both together."""
    want = "male" if (gender or "").strip().lower() == "male" else "female"
    return next((v for v in VOICES if v.gender == want), VOICES[0])
