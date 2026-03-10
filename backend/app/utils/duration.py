"""
Estimate performed duration of a monologue or scene text.

Uses a heuristic that accounts for natural pauses from punctuation,
paragraph breaks, and ellipses rather than a flat WPM calculation.
"""

import re

# Base speaking rate for performed delivery (WPM)
BASE_WPM = 130

# Pause durations in seconds
PAUSE_ELLIPSIS = 1.0        # "..."
PAUSE_SENTENCE_END = 0.5    # . ! ?
PAUSE_PARAGRAPH = 0.8       # line/paragraph break
PAUSE_CLAUSE = 0.2          # , ; : —


def estimate_duration_seconds(text: str) -> int:
    """Estimate performed duration in seconds from text content.

    Accounts for:
    - Base speaking rate of 130 WPM (realistic performance pace)
    - Sentence-ending punctuation as breath pauses
    - Ellipses as dramatic holds
    - Commas, semicolons, colons, dashes as clause pauses
    - Paragraph/line breaks as beat changes
    """
    if not text or not text.strip():
        return 0

    # Word count
    words = text.split()
    word_count = len(words)
    if word_count == 0:
        return 0

    # Base speaking time
    base_seconds = (word_count / BASE_WPM) * 60

    # Count pauses
    # Ellipses first (before counting individual periods)
    ellipsis_count = len(re.findall(r'\.{3}|…', text))
    # Remove ellipses before counting sentence enders
    text_no_ellipsis = re.sub(r'\.{3}|…', '', text)

    sentence_ends = len(re.findall(r'[.!?]+', text_no_ellipsis))
    clause_breaks = len(re.findall(r'[,;:\u2014\u2013]', text))  # includes em/en dash
    paragraph_breaks = len(re.findall(r'\n\s*\n', text))
    # Single line breaks (not paragraph breaks) count as shorter pauses
    single_breaks = text.count('\n') - (paragraph_breaks * 2)
    single_breaks = max(0, single_breaks)

    pause_seconds = (
        ellipsis_count * PAUSE_ELLIPSIS
        + sentence_ends * PAUSE_SENTENCE_END
        + clause_breaks * PAUSE_CLAUSE
        + paragraph_breaks * PAUSE_PARAGRAPH
        + single_breaks * PAUSE_CLAUSE
    )

    total = base_seconds + pause_seconds
    return max(5, int(round(total)))
