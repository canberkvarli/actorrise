"""The closed vocabulary for rehearsal_sessions.failure_reason.

The client decides the reason at abandon time because only it can see the
browser: whether the mic prompt was refused, whether speech recognition ever
existed, whether Begin was tapped. The server just refuses to store anything
it does not recognise, so the column stays groupable.

Order here is roughly "the product failed them" -> "they left":

  load_error          the session/scene fetch failed; they never saw a line
  speech_unsupported  no SpeechRecognition in this browser at all
  mic_denied          permission refused, or SR raised not-allowed
  speech_unavailable  SR exists but the service refused (iOS in-app browsers)
  speech_error        any other speech failure the client surfaced
  never_began         loaded fine, never tapped Begin
  no_lines            began, left before delivering a single line
  left_midway         delivered at least one line, then left
"""

from __future__ import annotations

from typing import Optional

FAILURE_REASONS = frozenset(
    {
        "load_error",
        "speech_unsupported",
        "mic_denied",
        "speech_unavailable",
        "speech_error",
        "never_began",
        "no_lines",
        "left_midway",
    }
)


def normalize_failure_reason(value: Optional[str]) -> Optional[str]:
    """Return the reason if it is one we know, else None. Never raises."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    return cleaned if cleaned in FAILURE_REASONS else None
