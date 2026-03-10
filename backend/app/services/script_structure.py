"""
Structural splitter for scripts with act/scene hierarchy.

Uses pure regex (zero AI cost) to detect act and scene headers
in scripts like Shakespeare plays, TV episodes, screenplays, etc.
and splits the text into labeled chunks for per-chunk AI extraction.

Supported formats:
- Stage plays: ACT III / SCENE II (Shakespeare, classical, modern)
- Screenplays: INT. / EXT. slug lines (Godfather, modern screenplays)
- TV scripts: COLD OPEN / ACT ONE / TAG
- Special: PROLOGUE / EPILOGUE
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class StructuralChunk:
    act_label: Optional[str]     # "Act 1", "Act III", etc.
    scene_label: Optional[str]   # "Scene 2", "INT. Office - Day", etc.
    text: str
    char_count: int = field(init=False)

    def __post_init__(self):
        self.char_count = len(self.text)


# Patterns that match act headers (case-insensitive via re.IGNORECASE)
ACT_PATTERNS = [
    r'^ACT\s+([IVX]+)',                                          # ACT III
    r'^ACT\s+(\d+)',                                             # ACT 3
    r'^ACT\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)',   # ACT ONE
]

# Patterns that match scene headers (stage plays)
SCENE_PATTERNS = [
    r'^SCENE\s+([IVX]+)',                                        # SCENE II
    r'^SCENE\s+(\d+)',                                           # SCENE 2
    r'^SCENE\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)', # SCENE ONE
]

# Screenplay slug line pattern — INT./EXT. headers
# e.g. "INT. DON CORLEONE'S OFFICE - DAY", "EXT. MALL PARKING LOT - NIGHT"
SLUG_LINE_PATTERN = r'^(INT\.|EXT\.|INT\./EXT\.|INT/EXT\.?|I/E\.?)\s+(.+)'

# Special structural labels (treated as acts)
SPECIAL_PATTERNS = [
    (r'^PROLOGUE\b', 'Prologue'),
    (r'^EPILOGUE\b', 'Epilogue'),
    (r'^COLD\s+OPEN\b', 'Cold Open'),     # TV scripts
    (r'^TEASER\b', 'Teaser'),             # TV scripts
    (r'^TAG\b', 'Tag'),                   # TV scripts
]

# Roman numeral to integer for normalization
_ROMAN_MAP = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5,
              'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}

_WORD_MAP = {'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5,
             'SIX': 6, 'SEVEN': 7, 'EIGHT': 8, 'NINE': 9}

# Max chunk size before splitting at paragraph boundaries
MAX_CHUNK_CHARS = 60000


def _normalize_number(value: str) -> str:
    """Convert roman numerals or word numbers to arabic for display."""
    upper = value.upper().strip()
    if upper in _ROMAN_MAP:
        return str(_ROMAN_MAP[upper])
    if upper in _WORD_MAP:
        return str(_WORD_MAP[upper])
    return value.strip()


def _match_act(line: str) -> Optional[str]:
    """Check if a line is an act header. Returns normalized label like 'Act 3'."""
    stripped = line.strip()
    for pattern in ACT_PATTERNS:
        m = re.match(pattern, stripped, re.IGNORECASE)
        if m:
            return f"Act {_normalize_number(m.group(1))}"

    for pattern, label in SPECIAL_PATTERNS:
        if re.match(pattern, stripped, re.IGNORECASE):
            return label

    return None


def _match_scene(line: str) -> Optional[str]:
    """Check if a line is a scene header. Returns normalized label like 'Scene 2'."""
    stripped = line.strip()
    for pattern in SCENE_PATTERNS:
        m = re.match(pattern, stripped, re.IGNORECASE)
        if m:
            return f"Scene {_normalize_number(m.group(1))}"
    return None


def _match_slug_line(line: str) -> Optional[str]:
    """Check if a line is a screenplay slug line (INT./EXT.). Returns the full slug."""
    stripped = line.strip()
    m = re.match(SLUG_LINE_PATTERN, stripped)
    if m:
        return stripped  # Return as-is, e.g. "INT. DON CORLEONE'S OFFICE - DAY"
    return None


def _detect_screenplay(lines: List[str]) -> bool:
    """Detect if the script is in screenplay format by counting INT./EXT. slug lines."""
    slug_count = sum(1 for line in lines if _match_slug_line(line))
    return slug_count >= 3  # At least 3 slug lines = screenplay


def _split_large_chunk(chunk: StructuralChunk) -> List[StructuralChunk]:
    """Split a chunk that exceeds MAX_CHUNK_CHARS at paragraph boundaries."""
    if chunk.char_count <= MAX_CHUNK_CHARS:
        return [chunk]

    parts = []
    paragraphs = re.split(r'\n\s*\n', chunk.text)
    current_text = ""

    for para in paragraphs:
        if len(current_text) + len(para) + 2 > MAX_CHUNK_CHARS and current_text:
            parts.append(StructuralChunk(
                act_label=chunk.act_label,
                scene_label=chunk.scene_label,
                text=current_text.strip(),
            ))
            current_text = para
        else:
            current_text += ("\n\n" + para if current_text else para)

    if current_text.strip():
        parts.append(StructuralChunk(
            act_label=chunk.act_label,
            scene_label=chunk.scene_label,
            text=current_text.strip(),
        ))

    return parts


def detect_structure(text: str) -> List[StructuralChunk]:
    """
    Detect act/scene structure in script text and split into labeled chunks.

    Supports three formats:
    1. Stage plays: ACT/SCENE headers (Shakespeare, classical, modern)
    2. Screenplays: INT./EXT. slug lines (Godfather, modern screenplays)
    3. Fallback: entire text as one chunk (simple scripts, pasted dialogue)
    """
    lines = text.split('\n')

    # First: try stage play detection (ACT/SCENE headers)
    boundaries = _detect_stage_play(lines)

    # If no stage play structure, try screenplay detection (INT./EXT.)
    if not boundaries and _detect_screenplay(lines):
        return _build_screenplay_chunks(lines)

    # No structure detected — return entire text as single chunk
    if not boundaries:
        return _split_large_chunk(StructuralChunk(
            act_label=None,
            scene_label=None,
            text=text,
        ))

    # Build chunks from stage play boundaries
    return _build_chunks_from_boundaries(lines, boundaries)


def _detect_stage_play(lines: List[str]) -> list:
    """Detect ACT/SCENE boundaries in stage play format."""
    boundaries = []  # (line_index, act_label_or_None, scene_label_or_None)
    current_act = None

    # First pass: find all real ACT boundaries (not special labels)
    has_real_acts = any(
        re.match(p, line.strip(), re.IGNORECASE)
        for line in lines
        for p in ACT_PATTERNS
    )

    for i, line in enumerate(lines):
        act = _match_act(line)
        if act:
            # PROLOGUE/EPILOGUE inside an existing act structure is likely
            # a character name (e.g. "PROLOGUE" character in Hamlet's
            # play-within-a-play). Only treat as structural if it appears
            # before the first real act or we have no real acts at all.
            is_special = act in ('Prologue', 'Epilogue', 'Cold Open', 'Teaser', 'Tag')
            if is_special and has_real_acts and current_act is not None:
                continue  # skip — it's nested inside a real act

            current_act = act
            boundaries.append((i, act, None))
            continue

        scene = _match_scene(line)
        if scene:
            boundaries.append((i, current_act, scene))

    return boundaries


def _build_screenplay_chunks(lines: List[str]) -> List[StructuralChunk]:
    """Build chunks from screenplay slug lines (INT./EXT.)."""
    boundaries = []
    scene_counter = 0

    for i, line in enumerate(lines):
        slug = _match_slug_line(line)
        if slug:
            scene_counter += 1
            boundaries.append((i, None, slug))

    if not boundaries:
        return _split_large_chunk(StructuralChunk(
            act_label=None, scene_label=None, text='\n'.join(lines),
        ))

    return _build_chunks_from_boundaries(lines, boundaries)


def _build_chunks_from_boundaries(lines: List[str], boundaries: list) -> List[StructuralChunk]:
    """Build chunks from detected boundaries (shared by stage play and screenplay)."""
    chunks = []

    # Text before first boundary (preamble/title page)
    if boundaries[0][0] > 0:
        preamble = '\n'.join(lines[:boundaries[0][0]])
        if preamble.strip():
            chunks.append(StructuralChunk(
                act_label=None,
                scene_label=None,
                text=preamble.strip(),
            ))

    for idx, (line_idx, act_label, scene_label) in enumerate(boundaries):
        # Text runs from this boundary to the next (or end of file)
        if idx + 1 < len(boundaries):
            end_idx = boundaries[idx + 1][0]
        else:
            end_idx = len(lines)

        chunk_text = '\n'.join(lines[line_idx:end_idx]).strip()

        if chunk_text:
            chunks.append(StructuralChunk(
                act_label=act_label,
                scene_label=scene_label,
                text=chunk_text,
            ))

    # Split any oversized chunks
    result = []
    for chunk in chunks:
        result.extend(_split_large_chunk(chunk))

    return result
