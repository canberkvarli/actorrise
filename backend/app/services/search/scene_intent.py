"""Detect when a monologue-surface query actually wants a two-person SCENE.

Live log audit (2026-07-20): users search the monologue surface for two-person
scenes ("Scenes from films for two actors" — one user ran it eight times) and
silently receive 20 monologues that don't fit. Until the scene library ships,
detecting the intent lets the UI be honest ("no two-person scenes yet") instead
of pretending monologues are matches.

Precision matters more than recall here: "macbeth scene", "emotional scene
actress 20s", and "breakup scene" all use "scene" loosely and are well served
as monologues, so only an EXPLICIT ask for two performers fires.
"""

import re
from typing import Optional

# Any one of these, matched case-insensitively, signals two performers.
_SIGNALS = [
    # "two actors", "two people", "two person", "two characters", "two-hander"…
    r"\b(?:two|2)[\s-]*(?:actor|actors|actress|actresses|people|persons?|"
    r"characters?|performers?|hander|handers?|guys?|men|women)\b",
    # "scene for two" — but NOT "monologue for two minutes" (duration, not cast)
    r"\bfor\s+(?:two|2)\b(?!\s*(?:min|mins?|minutes?|sec|secs?|seconds?|hours?|hrs?))",
    # scene-form words that inherently mean a pair
    r"\bduologues?\b",
    # gender-pair shorthand: M-M, F-F, M-F, F/M …
    r"\b[mf]\s*[-/]\s*[mf]\b",
    # "an actor … and … an actress" (two performer roles joined by "and")
    r"\b(?:actor|actress|performer)s?\b.{0,60}?\band\b.{0,40}?"
    r"\b(?:actor|actress|performer|man|woman|guy|girl|lady|gentleman)s?\b",
]

_SIGNAL_RES = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in _SIGNALS]


def detect_two_person_scene_intent(query: Optional[str]) -> bool:
    """True when the query explicitly asks for a two-person scene / duologue."""
    if not query or not str(query).strip():
        return False
    q = str(query)
    return any(rx.search(q) for rx in _SIGNAL_RES)
