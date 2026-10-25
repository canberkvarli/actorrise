"""Labels for a shelf scene: what the browse filters read.

One model call per cut scene (gpt-4o; about a cent each) for the parts a parser cannot
know: a title an actor would recognise, what happens, the two people's gender
and age, the tone, and whether the scene stands on its own. Everything else
(length, line count, era) is counted, not asked.

gpt-4o, not mini: on the first trial mini described Hedda burning "Thea's
child" in a scene where nothing of the kind is said, and called Aunt Julia
thirty. A shelf card that lies about its scene is worse than none.
"""

from __future__ import annotations

import json
from typing import Optional

TONES = ("dramatic", "comedic", "romantic", "tense", "tragic", "playful")
AGES = ("teens", "20s", "30s", "40s", "50s+", "any")
GENDERS = ("male", "female", "any")

#: Plays written before this are classical; Ibsen, Chekhov, Wilde and after
#: read as modern to an actor choosing a scene.
MODERN_FROM = 1850

_PROMPT = """You label a two-person scene from a public-domain play for actors choosing a scene to rehearse.
Play: {title} by {author}
Characters: {c1} and {c2}

The scene:
{text}

Answer in JSON with exactly these keys:
"title": a short name an actor would recognise, under 60 characters, naming the moment, not the play (e.g. "Nora asks for the money")
"description": one or two plain sentences on what happens IN THESE LINES and what each person wants. Use what you know of the play for who the two are, never for events these lines do not show
"tone": one of {tones}
"character_1_gender", "character_2_gender": one of {genders} ({c1} first)
"character_1_age_range", "character_2_age_range": one of {ages}, the age the character is in the play
"standalone": a number from 0 to 1, how well this works as a scene on its own in an acting class (clear stakes, a beginning and an end, both parts worth playing). Be strict: a scene of announcements or plot errands is under 0.5."""


def era_for(year: Optional[int], category: Optional[str]) -> str:
    if year:
        return "modern" if year >= MODERN_FROM else "classical"
    return "modern" if (category or "").lower() == "contemporary" else "classical"


def _scene_text(lines: list, max_words: int = 900) -> str:
    out, words = [], 0
    for line in lines:
        out.append(f"{line['character']}: {line['text']}")
        words += len(line["text"].split())
        if words >= max_words:
            out.append("[...]")
            break
    return "\n".join(out)


def _pick(value, allowed, default):
    value = (value or "").strip().lower() if isinstance(value, str) else ""
    for option in allowed:
        if value == option.lower():
            return option
    return default


def clean(raw: dict) -> dict:
    """Whatever the model said, made safe to store."""
    try:
        standalone = float(raw.get("standalone", 0))
    except (TypeError, ValueError):
        standalone = 0.0
    return {
        "title": (raw.get("title") or "").strip()[:200] or None,
        "description": (raw.get("description") or "").strip() or None,
        "tone": _pick(raw.get("tone"), TONES, None),
        "character_1_gender": _pick(raw.get("character_1_gender"), GENDERS, "any"),
        "character_2_gender": _pick(raw.get("character_2_gender"), GENDERS, "any"),
        "character_1_age_range": _pick(raw.get("character_1_age_range"), AGES, "any"),
        "character_2_age_range": _pick(raw.get("character_2_age_range"), AGES, "any"),
        "standalone": max(0.0, min(1.0, standalone)),
    }


def label(play_title: str, author: str, c1: str, c2: str, lines: list, llm=None) -> dict:
    """Ask the model once. ``llm`` is passed in by tests."""
    if llm is None:
        from app.services.ai.langchain.config import get_llm

        llm = get_llm(model="gpt-4o", use_json_format=True, temperature=0.2, timeout=60, max_retries=2)
    prompt = _PROMPT.format(
        title=play_title, author=author, c1=c1, c2=c2, text=_scene_text(lines),
        tones=", ".join(TONES), genders=", ".join(GENDERS), ages=", ".join(AGES),
    )
    reply = llm.invoke(prompt)
    content = getattr(reply, "content", reply)
    try:
        raw = json.loads(content)
    except (TypeError, ValueError):
        raw = {}
    return clean(raw)
