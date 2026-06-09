"""AI-assisted repair of broken monologues.

Some stored monologues (especially film/screenplay extractions that bypassed the
extraction-time quality gate) interleave the character's spoken lines with
screenplay action, scene headings, character introductions, and other speakers.
``strip_artifacts`` only removes ``(...)``/``[...]`` — it cannot drop a plain
narrative sentence like "Oscar stands on the curb long enough to light a
cigarette." This module sends such text to an LLM that returns ONLY the
character's continuous spoken monologue, then re-checks it against the
deterministic gate. A repair is accepted only if the result passes the gate, so
we never replace one broken monologue with another.

The LLM call is injectable (``invoke``) so the orchestration logic is unit
testable without hitting the API.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Callable, Optional

from app.services.extraction.monologue_quality import (
    DEFAULT_MAX_WORDS,
    DEFAULT_MIN_WORDS,
    assess_monologue_quality,
    strip_artifacts,
)

# Capable model — cost is acceptable here because this runs as a one-off backfill
# over the library, not on the hot path.
DEFAULT_REPAIR_MODEL = "gpt-4o"

# A callable taking the prompt string and returning the model's raw text reply.
Invoke = Callable[[str], str]


@dataclass
class RepairResult:
    """Outcome of attempting to repair one monologue.

    ``method`` is one of:
      - ``none``        already clean, nothing changed
      - ``strip``       fixed by removing ``(...)``/``[...]`` only
      - ``ai``          fixed by the LLM and passes the gate
      - ``ai_failed``   LLM produced a candidate that still fails the gate
                        (kept as a proposal for manual review)
      - ``strip_failed``  strip-only run (use_ai=False) that did not pass
    """

    cleaned_text: str
    passed_gate: bool
    method: str
    residual_reasons: list[str] = field(default_factory=list)


_SYSTEM = (
    "You repair badly-extracted theatre/film/TV monologues. You are given raw text "
    "for ONE character that may be polluted with screenplay action lines, scene "
    "headings (INT./EXT.), camera directions, character introductions in ALL CAPS, "
    "stage directions in parentheses, and stray lines from OTHER characters."
)

_INSTRUCTIONS = (
    "Return ONLY the words actually spoken by {character} (including voiceover "
    "narration spoken by {character}), in their original order, as one continuous "
    "passage of prose.\n"
    "Rules:\n"
    "- Keep {character}'s words verbatim. Do NOT paraphrase, summarise, rewrite, "
    "translate, or invent any text.\n"
    "- Remove action/description sentences — including lowercase narration mixed "
    "into the prose (e.g. 'A van follows at a distance.', 'He looks at the pills.', "
    "'Truman nods, unsure.', 'Verbal sees this; his smile fades.') — as well as "
    "scene headings, camera/sound cues, character-introduction lines, parenthetical "
    "stage directions, and any line spoken by another character.\n"
    "- Keep first-person description that {character} actually says aloud; only "
    "remove sentences that narrate physical action from outside the character's "
    "voice.\n"
    "- Do not include ALL-CAPS character/prop name slugs.\n"
    "- The result must end on a complete sentence (terminal . ! or ?).\n"
    "- If, after removing the noise, there is no genuine continuous monologue for "
    "{character} (the text is essentially all action/description, or is split "
    "between multiple speakers), set salvageable=false and monologue to an empty "
    "string.\n\n"
    'Respond with a JSON object exactly like: {{"monologue": "<text>", '
    '"salvageable": true}}'
)


def build_repair_prompt(
    text: str,
    *,
    character_name: str,
    play_title: str,
    author: str = "",
    source_type: str = "film",
) -> str:
    """Build the single-string prompt sent to the repair LLM.

    Includes the word "json" so it is safe to use with response_format=json_object.
    """
    char = character_name or "the character"
    src = {"film": "film", "tv": "TV", "play": "stage play"}.get(source_type, source_type)
    header = (
        f"{_SYSTEM}\n\n"
        f"Character: {char}\n"
        f"Source: {play_title or 'Unknown'}"
        + (f" by {author}" if author else "")
        + f" ({src})\n\n"
        + _INSTRUCTIONS.format(character=char)
    )
    return f"{header}\n\n--- RAW TEXT ---\n{text}\n--- END RAW TEXT ---"


def _default_invoke(model: str, temperature: float) -> Invoke:
    # Imported lazily so tests (which always inject ``invoke``) never need the
    # langchain/openai stack or an API key.
    from app.services.ai.langchain.config import get_llm

    llm = get_llm(model=model, temperature=temperature, use_json_format=True)

    def _invoke(prompt: str) -> str:
        return llm.invoke(prompt).content

    return _invoke


def ai_extract_monologue(
    text: str,
    *,
    character_name: str,
    play_title: str,
    author: str = "",
    source_type: str = "film",
    invoke: Optional[Invoke] = None,
    model: str = DEFAULT_REPAIR_MODEL,
    temperature: float = 0.0,
) -> str:
    """Ask the LLM to extract just ``character_name``'s spoken monologue.

    Returns the extracted text, or ``""`` if the model deems it unsalvageable or
    returns malformed output.
    """
    prompt = build_repair_prompt(
        text,
        character_name=character_name,
        play_title=play_title,
        author=author,
        source_type=source_type,
    )
    if invoke is None:
        invoke = _default_invoke(model, temperature)

    raw = invoke(prompt)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return ""
    if not isinstance(data, dict):
        return ""
    if data.get("salvageable") is False:
        return ""
    return (data.get("monologue") or "").strip()


def repair_monologue(
    text: str,
    *,
    character_name: str,
    play_title: str,
    author: str = "",
    source_type: str = "film",
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: int = DEFAULT_MAX_WORDS,
    use_ai: bool = True,
    check_narration: bool = False,
    invoke: Optional[Invoke] = None,
    model: str = DEFAULT_REPAIR_MODEL,
) -> RepairResult:
    """Attempt to turn ``text`` into a clean single-speaker monologue.

    Pipeline: (1) already clean? (2) does a conservative ``(...)``/``[...]`` strip
    fix it? (3) can the LLM extract a clean monologue? A result is only marked
    ``passed_gate`` when it passes :func:`assess_monologue_quality`.

    ``check_narration`` enables detection/removal of lowercase screenplay
    narration (film/TV only — classical verse legitimately uses third person).
    """

    def _assess(t: str):
        return assess_monologue_quality(
            t, min_words=min_words, max_words=max_words, check_narration=check_narration
        )

    base = _assess(text)
    if base.ok:
        return RepairResult(text, True, "none", [])

    stripped = strip_artifacts(text)
    s = _assess(stripped)
    if s.ok:
        return RepairResult(stripped, True, "strip", [])

    if not use_ai:
        return RepairResult(stripped, False, "strip_failed", s.reasons)

    candidate = ai_extract_monologue(
        text,
        character_name=character_name,
        play_title=play_title,
        author=author,
        source_type=source_type,
        invoke=invoke,
        model=model,
    )
    a = _assess(candidate)
    if a.ok:
        return RepairResult(candidate, True, "ai", [])
    return RepairResult(candidate, False, "ai_failed", a.reasons)
