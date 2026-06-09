"""Tests for the AI-assisted monologue repair service.

The LLM call is injected so these run offline and deterministically.
"""

from __future__ import annotations

from app.services.extraction.monologue_repair import (
    ai_extract_monologue,
    build_repair_prompt,
    repair_monologue,
)


# A real-world broken case: a character's voiceover interleaved with screenplay
# action lines and a character introduction (mirrors the Usual Suspects bug).
DIRTY = (
    "New York's finest Taxi Service was not your normal taxi service.\n"
    "It was a ring of corrupt cops in the N.Y.P.D. that ran a high-profit racket.\n"
    "OSCAR WHITEHEAD, a tall gray-haired man in his fifties comes out of the terminal.\n"
    "For a few hundred dollars a mile, you got your own black and white.\n"
    "Oscar stands on the curb long enough to light a cigarette.\n"
    "A POLICE CRUISER pulls up to him.\n"
    "And that was how we started, a little goodbye from the five of us.\n"
    "A VAN follows at a distance."
)

# The spoken-only version a good LLM should return: action lines removed, ends
# on a complete sentence, no ALL-CAPS name residue.
CLEAN_VO = (
    "New York's finest Taxi Service was not your normal taxi service. "
    "It was a ring of corrupt cops in the N.Y.P.D. that ran a high-profit racket. "
    "For a few hundred dollars a mile, you got your own black and white. "
    "And that was how we started, a little goodbye from the five of us."
)


def test_already_clean_text_is_left_untouched():
    res = repair_monologue(
        CLEAN_VO,
        character_name="Verbal",
        play_title="The Usual Suspects",
        min_words=10,
    )
    assert res.passed_gate is True
    assert res.method == "none"
    assert res.cleaned_text == CLEAN_VO


def test_strip_pass_fixes_parenthetical_only_dirt():
    text = (
        "I have lived a long life and seen many things. (beat) "
        "I have buried friends and outlived enemies, and still I rise each morning "
        "to do the work that no one else will do for me."
    )
    res = repair_monologue(
        text,
        character_name="Lear",
        play_title="King Lear",
        min_words=10,
        use_ai=False,
    )
    assert res.passed_gate is True
    assert res.method == "strip"
    assert "(beat)" not in res.cleaned_text


def test_ai_repair_salvages_interleaved_action_lines():
    # Injected LLM returns the clean voiceover.
    fake = lambda prompt: '{"monologue": %s, "salvageable": true}' % _json_str(CLEAN_VO)
    res = repair_monologue(
        DIRTY,
        character_name="Verbal",
        play_title="The Usual Suspects",
        min_words=10,
        invoke=fake,
    )
    assert res.method == "ai"
    assert res.passed_gate is True
    assert "OSCAR WHITEHEAD" not in res.cleaned_text
    assert "VAN" not in res.cleaned_text
    assert res.cleaned_text == CLEAN_VO


def test_ai_output_still_dirty_is_returned_as_unapproved_proposal():
    # LLM hands back something that still trips the gate (leaves a scene heading).
    bad = "INT. BAR - NIGHT He walks in. OSCAR sits down and STARES at the WALL."
    fake = lambda prompt: '{"monologue": %s, "salvageable": true}' % _json_str(bad)
    res = repair_monologue(
        DIRTY,
        character_name="Verbal",
        play_title="The Usual Suspects",
        min_words=10,
        invoke=fake,
    )
    assert res.method == "ai_failed"
    assert res.passed_gate is False
    assert res.residual_reasons  # non-empty
    assert res.cleaned_text == bad  # proposed text preserved for manual review


def test_unsalvageable_returns_empty_proposal():
    fake = lambda prompt: '{"monologue": "", "salvageable": false}'
    res = repair_monologue(
        DIRTY,
        character_name="Verbal",
        play_title="The Usual Suspects",
        min_words=10,
        invoke=fake,
    )
    assert res.passed_gate is False
    assert res.method == "ai_failed"
    assert res.cleaned_text == ""


def test_malformed_llm_json_does_not_crash():
    fake = lambda prompt: "not json at all"
    out = ai_extract_monologue(
        DIRTY,
        character_name="Verbal",
        play_title="The Usual Suspects",
        invoke=fake,
    )
    assert out == ""


def test_prompt_includes_character_and_text():
    prompt = build_repair_prompt(
        DIRTY,
        character_name="Verbal",
        play_title="The Usual Suspects",
        author="Bryan Singer",
        source_type="film",
    )
    assert "Verbal" in prompt
    assert "The Usual Suspects" in prompt
    assert "OSCAR WHITEHEAD" in prompt  # the source text is embedded
    assert "json" in prompt.lower()  # required for response_format=json_object


def _json_str(s: str) -> str:
    import json

    return json.dumps(s)
