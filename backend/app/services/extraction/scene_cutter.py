"""Cut two-person scenes out of a public-domain play for the scene shelf.

The shelf stores where a scene sits (character offsets into the play's text),
never its lines. This module is both halves of that: ``cut_play`` finds the
scenes once, in a batch, and ``lines_between`` cuts the same lines back out
when an actor presses Rehearse. Both read the play with the monologue parser's
own ``speeches``, so the two halves agree on where every speech starts.

A scene here is a stretch where exactly two people talk:
- it never crosses an act or scene heading, an entrance or an exit
- at least ``MIN_TURNS`` speeches, each person with ``MIN_EACH``
- between ``MIN_SECONDS`` and ``MAX_SECONDS`` performed, longer stretches are
  cut into pieces at speech boundaries
- neither part carries more than ``MAX_BALANCE`` times the other's words
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import List, Optional

from app.services.extraction.plain_text_parser import PlainTextParser
from app.utils.duration import estimate_duration_seconds

MIN_TURNS = 8
MIN_EACH = 3
MIN_SECONDS = 60
MAX_SECONDS = 300
#: Where a long stretch is cut: a piece closes before it would pass this.
SPLIT_SECONDS = 240
MAX_BALANCE = 4.0

#: An act or scene heading inside a speech body: the speech ends there.
_HEADING = re.compile(
    r"^[ \t_\[(]*(?:ACT|Act|SCENE|Scene)[ \t.]+(?:[IVXLC]+\b|\d+\b|[A-Z][a-z]+\b)"
    r"|^[ \t]*(?:CURTAIN|THE END|END OF)\b",
    re.MULTILINE,
)
#: Someone comes or goes: a two-person stretch does not survive it.
#: Not \\b: Gutenberg italicises directions as "_Enter a Messenger._", and
#: "_" is a word character, so \\b never fires after it.
#: Modern texts say it in prose: "Lane goes out.", "Nora comes in.".
_ENTER_EXIT = re.compile(
    r"(?<![A-Za-z])(?:Enter|Re-enter|Exit|Exeunt|enters|re-enters|exits"
    r"|go(?:es)? out|go(?:es)? off|come?s? in|comes back|leaves the room)(?![A-Za-z])"
)
#: Not people: a scene for two actors is never the chorus and someone.
_GROUPS = frozenset({"chorus", "all", "both", "omnes", "leader", "the chorus", "crowd", "voices", "others"})
_PARENS = re.compile(r"\(([^)]*)\)")


@dataclass
class Speech:
    character: str
    start: int
    end: int
    spoken: str
    direction: Optional[str]
    breaks_after: bool = False


@dataclass
class Candidate:
    character_1: str
    character_2: str
    start: int
    end: int
    turns: int
    words: int
    duration_seconds: int
    lines: List[dict] = field(default_factory=list)


def play_text(full_text: str, text_format: Optional[str]) -> str:
    """The text the offsets point into: HTML is read as the extractor reads it."""
    if (text_format or "plain") == "html":
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(full_text, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text()
    return full_text


def span_hash(text: str, start: int, end: int) -> str:
    return hashlib.sha256(text[start:end].encode("utf-8")).hexdigest()


def read_speeches(text: str) -> List[Speech]:
    """Every speech with where it sits in ``text``, in order."""
    parser = PlainTextParser()
    cast = parser._cast_list(text)
    out: List[Speech] = []
    cursor = 0
    for cue, body in parser.speeches(text, merge=False):
        at = text.find(body, cursor)
        if at < 0:
            # Not where the parser said: whatever came between is unknown, so
            # the stretch before it cannot run on past it.
            if out:
                out[-1].breaks_after = True
            continue
        breaks_after = False
        heading = _HEADING.search(body)
        if heading:
            body = body[: heading.start()]
            breaks_after = True
        end = at + len(body)
        cursor = end
        if _ENTER_EXIT.search(body):
            breaks_after = True
        display = parser._strip_leading_narrative(parser._to_display(body))
        spoken = parser._spoken_only(display).strip()
        directions = [d.strip() for d in _PARENS.findall(display) if d.strip()]
        character = parser._expand_from_cast(parser._normalize_character_name(cue), cast)
        if not spoken:
            if out and breaks_after:
                out[-1].breaks_after = True
            continue
        out.append(Speech(
            character=character,
            start=at,
            end=end,
            spoken=spoken,
            direction="; ".join(directions) or None,
            breaks_after=breaks_after,
        ))
    return out


def two_person_runs(speeches: List[Speech]) -> List[List[Speech]]:
    """Maximal stretches in which only two people speak."""
    runs: List[List[Speech]] = []
    current: List[Speech] = []

    def close():
        if len({s.character for s in current}) == 2:
            runs.append(list(current))

    for speech in speeches:
        speakers = {s.character for s in current} | {speech.character}
        if len(speakers) > 2:
            prev = current[-1]
            # The speech before a newcomer is usually to the newcomer ("How are
            # you, my dear Ernest?"), so the stretch ends one speech earlier.
            current = current[:-1]
            close()
            # The last speaker before the newcomer may be the one who stays.
            current = [prev, speech] if prev.character != speech.character else [speech]
        else:
            current.append(speech)
        if speech.breaks_after:
            close()
            current = []
    close()
    return runs


def _duration(speeches: List[Speech]) -> int:
    return estimate_duration_seconds("\n".join(s.spoken for s in speeches))


def _pieces(run: List[Speech]) -> List[List[Speech]]:
    """A long stretch, cut at speech boundaries into pieces under SPLIT_SECONDS."""
    if _duration(run) <= MAX_SECONDS:
        return [run]
    pieces, piece = [], []
    for speech in run:
        if piece and _duration(piece + [speech]) > SPLIT_SECONDS:
            pieces.append(piece)
            piece = []
        piece.append(speech)
    if piece:
        pieces.append(piece)
    return pieces


def _gate(piece: List[Speech]) -> Optional[Candidate]:
    names = []
    for s in piece:
        if s.character not in names:
            names.append(s.character)
    if len(names) != 2 or len(piece) < MIN_TURNS:
        return None
    if any(n.lower() in _GROUPS for n in names):
        return None
    # One person twice running is a speech the parser split or a cue it
    # missed ("Oh, you showed them to Jane? Ruth. No, I didn't."). Once can
    # be a direction between; twice is a misread scene.
    if sum(1 for a, b in zip(piece, piece[1:]) if a.character == b.character) > 1:
        return None
    if any(_missed_cue(s.spoken, names) for s in piece):
        return None
    turns = {n: sum(1 for s in piece if s.character == n) for n in names}
    if min(turns.values()) < MIN_EACH:
        return None
    words = {n: sum(len(s.spoken.split()) for s in piece if s.character == n) for n in names}
    if min(words.values()) == 0 or max(words.values()) / min(words.values()) > MAX_BALANCE:
        return None
    seconds = _duration(piece)
    if not MIN_SECONDS <= seconds <= MAX_SECONDS:
        return None
    return Candidate(
        character_1=names[0],
        character_2=names[1],
        start=piece[0].start,
        end=piece[-1].end,
        turns=len(piece),
        words=sum(words.values()),
        duration_seconds=seconds,
        lines=to_lines(piece),
    )


def _missed_cue(spoken: str, names: List[str]) -> bool:
    """A cue left inside a line: "...overnight. Ruth. No, really I didn't."."""
    for name in names:
        if re.search(r"(?:^|[.!?]\s+)" + re.escape(name) + r"\.\s+[A-Z]", spoken):
            return True
    return False


def to_lines(speeches: List[Speech]) -> List[dict]:
    """The shape scripts._build_scenes takes."""
    return [
        {"character": s.character, "text": s.spoken, "stage_direction": s.direction}
        for s in speeches
    ]


def cut_play(text: str) -> List[Candidate]:
    """Every two-person scene in a play that passes the gates, in play order."""
    found = []
    for run in two_person_runs(read_speeches(text)):
        for piece in _pieces(run):
            candidate = _gate(piece)
            if candidate:
                found.append(candidate)
    return found


def lines_between(text: str, start: int, end: int) -> List[dict]:
    """The lines of the scene stored as [start, end): read again, never stored."""
    return to_lines([s for s in read_speeches(text) if s.start >= start and s.end <= end])
