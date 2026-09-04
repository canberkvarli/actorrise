"""The scene map — everything a script contains, before anything is extracted.

Two passes were being conflated. Finding out *what is in* a play is cheap: it is
regex over line starts, plus one small model call to catch what regex cannot
see. Turning a scene into rehearsable dialogue is the expensive part. Separating
them means the map can always be complete, for everyone, while the cost sits on
the scenes someone actually picked.

The failure this module exists to prevent is the quiet one. A play that yields
three scenes when it has twenty does not raise anything — it just shows you a
short list, and you never learn what is missing. So: spans always tile the text
with no gaps, the AI pass may only *add* scenes, and `looks_under_segmented` is
deliberately trigger-happy about asking for a second opinion.

`detect_structure` in script_structure.py stays as it is. It splits at
MAX_CHUNK_CHARS for the extractor's benefit, which is right there and wrong
here: a long scene arriving as three chunks would show up in the map as the same
scene three times.
"""

from __future__ import annotations

import bisect
import logging
import re
from dataclasses import dataclass, field, replace
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from app.services.script_parser import parse_dialogue
from app.services.script_structure import (
    _detect_screenplay,
    _detect_stage_play,
    _match_slug_line,
)

# A scene longer than this is treated as suspicious rather than long. Set low on
# purpose: the cost of asking the model to look again is a fraction of a cent,
# and the cost of missing a scene is that an actor never finds it.
BIG_SCENE_CHARS = 25_000

logger = logging.getLogger(__name__)


@dataclass
class SceneSpan:
    """One scene, and exactly where it sits in the text."""

    act_label: Optional[str]
    scene_label: Optional[str]
    text: str
    char_start: int
    char_end: int
    title: Optional[str] = None
    characters: List[str] = field(default_factory=list)
    line_count: int = 0

    @property
    def char_count(self) -> int:
        return self.char_end - self.char_start


@dataclass
class PageOffsets:
    """Where each page starts in the concatenated text.

    Empty for TXT uploads, which have no pages — callers get None rather than a
    made-up page 1.
    """

    starts: Sequence[int]
    total: int


def pages_for_span(
    offsets: PageOffsets, char_start: int, char_end: int
) -> Tuple[Optional[int], Optional[int]]:
    """1-indexed (first page, last page) a span touches.

    This is what lets extraction run pdfplumber over twelve pages of Hamlet
    instead of a hundred and seventy.
    """
    if not offsets.starts:
        return (None, None)

    starts = list(offsets.starts)
    first = bisect.bisect_right(starts, char_start) - 1
    # char_end is exclusive, so a span ending exactly on a page boundary has not
    # reached that page.
    last_char = max(char_start, char_end - 1)
    last = bisect.bisect_right(starts, last_char) - 1
    return (max(0, first) + 1, max(0, last) + 1)


def _speakers(text: str) -> Tuple[List[str], int]:
    """Who speaks in this slice, and how many lines they have between them."""
    names: List[str] = []
    seen = set()
    line_count = 0
    try:
        sections = parse_dialogue(text)
    except Exception:
        # Parsing is best-effort here. A scene we cannot read the cast of is
        # still a scene, and still has to appear in the map.
        return ([], 0)

    for section in sections:
        line_count += len(section.get("lines") or [])
        for name in section.get("characters") or []:
            key = name.strip().upper()
            if key and key not in seen:
                seen.add(key)
                names.append(name.strip())
    return (names, line_count)


def _line_offsets(text: str) -> List[int]:
    """Char offset of the start of every line, so boundaries carry positions."""
    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def _boundaries(text: str) -> List[Tuple[int, Optional[str], Optional[str]]]:
    """(line index, act label, scene label) for every structural header."""
    lines = text.split("\n")

    stage = _detect_stage_play(lines)
    if stage:
        return stage

    if _detect_screenplay(lines):
        slugs = []
        for i, line in enumerate(lines):
            slug = _match_slug_line(line)
            if slug:
                slugs.append((i, None, slug))
        if slugs:
            return slugs

    return []


def _absorb_bare_act_headers(spans: List[SceneSpan]) -> List[SceneSpan]:
    """Fold "ACT I" into the scene that follows it.

    An act header is a boundary but not a scene. Left on its own it becomes a
    pickable row containing nothing but the words "ACT I", which is not
    something anyone can rehearse.
    """
    merged: List[SceneSpan] = []
    for span in spans:
        if (
            merged
            and merged[-1].scene_label is None
            and merged[-1].act_label is not None
            and span.scene_label is not None
            and span.act_label == merged[-1].act_label
        ):
            head = merged.pop()
            span = replace(span, char_start=head.char_start, text=head.text + span.text)
        merged.append(span)
    return merged


def _finalize(spans: List[SceneSpan]) -> List[SceneSpan]:
    """Attach cast and line counts, then drop what is not a scene.

    A printed table of contents lists `ACT 1` and `SCENE 1` in exactly the form
    the regex is looking for, so a book that has one produces a run of scenes
    before the play has started. Real Hamlet opened the picker with nineteen of
    them: no cast, no dialogue, all on page 2, Acts 1 to 5 listed twice.

    Nobody speaks in a contents page, and that is the test. Cast is derived from
    the text rather than the headings, so it does not care how the file is laid
    out. A span nobody speaks in cannot be rehearsed, which makes it not a scene
    however convincingly it is labelled.
    """
    out = []
    for span in spans:
        names, lines = _speakers(span.text)
        out.append(replace(span, characters=names, line_count=lines))

    # Both signals, because each has a false positive on its own. A title page
    # is a run of capitals, so the parser reads "THE TRAGEDY OF HAMLET" as a
    # character cue and the span looks cast. Requiring somebody to actually say
    # something is what separates a scene from a page that merely looks like one.
    spoken = [s for s in out if s.characters and s.line_count > 0]
    # Everything dropped means we misread the file, not that it has no scenes.
    # An unpickable row beats an empty screen that looks like a failed parse.
    return spoken or out


def _drop_front_matter(spans: List[SceneSpan], had_preamble: bool) -> List[SceneSpan]:
    """Remove the title page, if that is what the first span is.

    The contents listing dies in `_finalize` because nobody speaks in it. A
    title page is different: it is a run of capitals, so the parser reads
    "THE TRAGEDY OF HAMLET" as a character cue and "Contents" as their line, and
    the span arrives looking cast and spoken.

    Only the preamble is judged this way — the text before the first heading,
    which is the only place a title page can be. A real scene with one speaker
    is a soliloquy and stays.
    """
    if not had_preamble or len(spans) < 2:
        return spans
    first = spans[0]
    if first.act_label or first.scene_label:
        return spans
    if len(first.characters) >= 2:
        return spans
    return spans[1:]


def detect_scene_spans(text: str) -> List[SceneSpan]:
    """Every scene in the text, tiling it end to end with no gaps.

    Never returns an empty list for non-empty input. A side whose header was
    cropped off is one scene, not zero — zero would mean it cannot be picked,
    and it would look identical to a parse that failed.
    """
    if not text:
        return []

    bounds = _boundaries(text)
    if not bounds:
        span = SceneSpan(
            act_label=None,
            scene_label=None,
            text=text,
            char_start=0,
            char_end=len(text),
        )
        return _finalize([span])

    line_starts = _line_offsets(text)
    spans: List[SceneSpan] = []

    # Anything before the first header — a title page, a dramatis personae.
    first_offset = line_starts[bounds[0][0]]
    had_preamble = first_offset > 0 and bool(text[:first_offset].strip())
    if had_preamble:
        spans.append(
            SceneSpan(
                act_label=None,
                scene_label=None,
                text=text[:first_offset],
                char_start=0,
                char_end=first_offset,
            )
        )

    for idx, (line_idx, act_label, scene_label) in enumerate(bounds):
        start = line_starts[line_idx]
        if idx + 1 < len(bounds):
            end = line_starts[bounds[idx + 1][0]]
        else:
            end = len(text)
        if end <= start:
            continue
        spans.append(
            SceneSpan(
                act_label=act_label,
                scene_label=scene_label,
                text=text[start:end],
                char_start=start,
                char_end=end,
            )
        )

    return _drop_front_matter(
        _finalize(_absorb_bare_act_headers(spans)), had_preamble
    )


def looks_under_segmented(spans: Iterable[SceneSpan]) -> bool:
    """Is regex likely to have missed scene breaks it could not see?

    True for a play with no headers the patterns recognise, and for a play where
    one "scene" is longer than any scene really is. Both are the shape of a
    modern script that marks its breaks with white space, an asterisk, or a page
    break rather than the word SCENE.

    Biased towards saying yes. A false yes costs one small model call; a false
    no costs a scene nobody can find.
    """
    return any(span.char_count > BIG_SCENE_CHARS for span in spans)


def merge_ai_segmentation(
    spans: Sequence[SceneSpan], extra_breaks: Iterable[dict]
) -> List[SceneSpan]:
    """Fold the model's extra scene breaks into the regex spans.

    Add only. The model may say "there is another scene starting here"; it may
    not say "those two scenes you found are really one", because a wrong merge
    silently removes something an actor could otherwise have picked. Split
    points outside the text, or landing exactly on a boundary we already have,
    are dropped.
    """
    if not spans:
        return list(spans)

    titles: Dict[int, str] = {}
    points: List[int] = []
    for item in extra_breaks or []:
        try:
            point = int(item.get("char_start"))
        except (TypeError, ValueError):
            continue
        if point <= spans[0].char_start or point >= spans[-1].char_end:
            continue
        points.append(point)
        title = item.get("title")
        if title:
            titles[point] = str(title)

    if not points:
        return list(spans)

    out: List[SceneSpan] = []
    for span in spans:
        inside = sorted(
            p for p in set(points) if span.char_start < p < span.char_end
        )
        if not inside:
            out.append(span)
            continue

        cursor = span.char_start
        base = span.text
        for n, point in enumerate(inside):
            piece = base[cursor - span.char_start : point - span.char_start]
            names, lines = _speakers(piece)
            out.append(
                replace(
                    span,
                    text=piece,
                    char_start=cursor,
                    char_end=point,
                    # Only the opening piece keeps the scene's name. The rest are
                    # new scenes the model found inside it, and repeating one
                    # title down three rows tells you nothing about which is
                    # which.
                    title=span.title if n == 0 else titles.get(cursor),
                    characters=names,
                    line_count=lines,
                )
            )
            cursor = point
        tail = base[cursor - span.char_start :]
        names, lines = _speakers(tail)
        out.append(
            replace(
                span,
                text=tail,
                char_start=cursor,
                char_end=span.char_end,
                title=titles.get(cursor),
                characters=names,
                line_count=lines,
            )
        )

    return out


def apply_ai_titles(
    spans: Sequence[SceneSpan], titles: Dict[int, str]
) -> List[SceneSpan]:
    """Name scenes the way an actor would ask for them ("the nunnery scene")."""
    return [
        replace(span, title=titles.get(i, span.title)) for i, span in enumerate(spans)
    ]


def pages_for_selection(picked: Iterable[dict]) -> set:
    """Every page the ticked scenes touch, 1-indexed.

    Extraction reads these and nothing else, which is where the saving lives: a
    dozen pages of Hamlet rather than the whole book.

    An empty set means "no page information", not "no pages" — a TXT upload has
    none. Callers must read the whole file in that case rather than nothing.
    """
    pages = set()
    for scene in picked or []:
        start, end = scene.get("page_start"), scene.get("page_end")
        if start is None or end is None:
            continue
        try:
            lo, hi = int(start), int(end)
        except (TypeError, ValueError):
            continue
        if lo > hi:
            lo, hi = hi, lo
        pages.update(range(lo, hi + 1))
    return pages


# ---------------------------------------------------------------------------
# Reading the file
# ---------------------------------------------------------------------------

# How much of a page's text we are willing to lose to pypdf before falling back.
_FALLBACK_CHARS_PER_PAGE = 40


def extract_text_with_pages(
    file_content: bytes, file_ext: str
) -> Tuple[str, PageOffsets]:
    """Text of the whole file, plus where each page begins.

    pypdf, not pdfplumber. Measured on a 170-page play: pdfplumber 15.6s and
    295 MB, pypdf 0.4s and 81 MB, for the same text. That 15.6s was blocking the
    event loop, so uploading a play took the whole API down until Render's health
    check gave up and restarted the instance.

    pdfplumber stays where it earns its keep — the extraction pass, where
    `pdf_page_text` strips watermarks and keeps the column positions a
    screenplay encodes its meaning in. Finding ACT and SCENE needs neither, so
    the map does not pay for either. If pypdf comes back with almost nothing —
    a scanned or unusually encoded PDF — we fall back rather than report an
    empty play.
    """
    if file_ext != "pdf":
        try:
            text = file_content.decode("utf-8")
        except UnicodeDecodeError:
            text = file_content.decode("latin-1")
        return (text, PageOffsets([], total=0))

    import io

    pages: List[str] = []
    reason = ""
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(file_content))
        pages = [(page.extract_text() or "") for page in reader.pages]
        if not pages:
            reason = "pypdf found no pages"
        elif len("".join(pages).strip()) < _FALLBACK_CHARS_PER_PAGE * len(pages):
            reason = f"pypdf returned almost no text for {len(pages)} pages"
    except Exception as e:  # pragma: no cover - depends on the file
        reason = f"pypdf failed: {type(e).__name__}: {e}"

    if not reason:
        return _join_pages(pages)

    # Fall back to the slow, thorough reader. Logged, not silent: this path is
    # 30x slower, and when pypdf was simply missing from the environment the
    # quiet `except` turned that into a mysterious twelve-second scan rather
    # than an error anyone could see.
    logger.warning("scene map falling back to pdfplumber — %s", reason)

    import pdfplumber

    from app.services.script_parser import pdf_page_text

    with pdfplumber.open(io.BytesIO(file_content)) as pdf:
        pages = [pdf_page_text(page) or "" for page in pdf.pages]
    return _join_pages(pages)


def _join_pages(pages: Sequence[str]) -> Tuple[str, PageOffsets]:
    starts: List[int] = []
    cursor = 0
    parts: List[str] = []
    for page in pages:
        starts.append(cursor)
        block = page + "\n\n"
        parts.append(block)
        cursor += len(block)
    text = "".join(parts)
    return (text, PageOffsets(starts, total=len(text)))


# ---------------------------------------------------------------------------
# The model's second opinion
# ---------------------------------------------------------------------------

MAP_MODEL = "gpt-4o-mini"

# How much of a suspiciously long scene the model gets to look at. Enough to
# find breaks, short enough that the call stays cheap on a whole play.
_SAMPLE_CHARS = 6_000
_MAX_SAMPLES = 12

_PROMPT = """You are reading a stage play or screenplay that a regex parser has \
already split into {n} scene(s). The parser only recognises headers like \
"ACT III", "SCENE II" and "INT. OFFICE - DAY". It misses scenes that are marked \
some other way: a blank gap, a row of asterisks, a change of location written in \
prose, or a page break.

Below is a numbered sample of each scene the parser found, with the character \
offset each sample begins at.

For each sample, answer two things:
1. Does it contain a scene break the parser missed? If so give the character \
offset in the ORIGINAL text where the new scene begins. Offsets must be inside \
the sample you were shown. Only report a break you are confident about.
2. A short title an actor would recognise, six words or fewer, naming what \
happens IN the scene: who is there and what they do ("The guard on the \
platform", "Ophelia returns the letters"). Name it from the dialogue you can \
see. If you cannot tell what happens, return null for the title. Never describe \
the scene's position in the play — "Beginning of Act 1", "Continuation of Act \
2", "Front matter" and anything like them are worse than no title, because the \
label is already on the row. No invented plot.

Return JSON only:
{{"scenes": [{{"index": 0, "title": "...", "breaks": [{{"char_start": 1234, \
"title": "..."}}]}}]}}

Samples:
{samples}"""


# Titles that only restate where the scene sits. The act and scene are already
# printed on the row, so these cost a line and say nothing. Real Hamlet came back
# with "Continuation of Act 1" four rows running.
_FILLER_TITLE = re.compile(
    r"^\s*(beginning|continuation|start|end|opening|closing|conclusion|"
    r"front\s*matter|contents|introduction|prologue\s*$|"
    r"act\s|scene\s|part\s|section\s|chapter\s)",
    re.IGNORECASE,
)


def _useful_title(raw) -> Optional[str]:
    """A title worth showing, or None."""
    if not raw:
        return None
    title = str(raw).strip()
    if not title or _FILLER_TITLE.match(title):
        return None
    # A bare "Act 2" or "Scene 4" with nothing after it.
    if re.fullmatch(r"(act|scene|part)\s*[\dIVXivx]*", title, re.IGNORECASE):
        return None
    return title[:80]


def _samples_for(spans: Sequence[SceneSpan]) -> str:
    blocks = []
    for i, span in enumerate(spans[:_MAX_SAMPLES]):
        excerpt = span.text[:_SAMPLE_CHARS]
        blocks.append(
            f"--- scene {i} (begins at character {span.char_start}) ---\n{excerpt}"
        )
    return "\n\n".join(blocks)


def enrich_with_ai(spans: List[SceneSpan], client) -> List[SceneSpan]:
    """Ask a small model for the scenes regex could not see, and for names.

    Additive by construction: `merge_ai_segmentation` only splits, and titles
    cannot change the count. If the call fails, times out, or comes back as
    something other than the shape we asked for, we keep the regex map. A map
    that is merely plain is fine; a map that lost a scene is not.
    """
    if not spans or client is None:
        return spans

    prompt = _PROMPT.format(n=len(spans), samples=_samples_for(spans))

    try:
        response = client.chat.completions.create(
            model=MAP_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1500,
            timeout=25,
        )
        raw = response.choices[0].message.content or ""
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return spans
        import json

        payload = json.loads(match.group())
    except Exception:
        return spans

    scenes = payload.get("scenes")
    if not isinstance(scenes, list):
        return spans

    titles: Dict[int, str] = {}
    breaks: List[dict] = []
    for item in scenes:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        title = _useful_title(item.get("title"))
        if title and 0 <= idx < len(spans):
            titles[idx] = title
        for brk in item.get("breaks") or []:
            if isinstance(brk, dict):
                breaks.append(brk)

    return merge_ai_segmentation(apply_ai_titles(spans, titles), breaks)


def build_scene_map(
    file_content: bytes, file_ext: str, client=None
) -> Tuple[List[SceneSpan], PageOffsets, str]:
    """The whole map: read the file, find every scene, name them.

    The AI pass only runs when regex looks like it under-segmented, so a
    well-marked Shakespeare text costs nothing beyond the regex.
    """
    text, offsets = extract_text_with_pages(file_content, file_ext)
    spans = detect_scene_spans(text)
    if client is not None and looks_under_segmented(spans):
        spans = enrich_with_ai(spans, client)
    return (spans, offsets, text)
