"""Tests for narration + join-artifact detection in the quality gate, and that
the repair pipeline threads ``check_narration`` through.
"""

from __future__ import annotations

from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    has_narration,
)
from app.services.extraction.monologue_repair import repair_monologue

# A first-person monologue with one screenplay-narration sentence merged in.
NARRATED = (
    "I know Ruby. He's very big on respect, and he likes me very much. "
    "Verbal sees this getting to something. "
    "Now I know your testimony was sealed, and I intend to keep it that way."
)

CLEAN_FIRST_PERSON = (
    "I know Ruby. He is very big on respect, and he likes me very much. "
    "Now I know your testimony was sealed, and I intend to keep it that way."
)


def test_narration_not_flagged_when_check_disabled():
    r = assess_monologue_quality(NARRATED, min_words=5)
    assert "narration" not in r.reasons


def test_narration_flagged_when_check_enabled():
    r = assess_monologue_quality(NARRATED, min_words=5, check_narration=True)
    assert "narration" in r.reasons


def test_clean_first_person_not_flagged_as_narration():
    assert has_narration(CLEAN_FIRST_PERSON) is False
    r = assess_monologue_quality(CLEAN_FIRST_PERSON, min_words=5, check_narration=True)
    assert "narration" not in r.reasons


def test_join_artifact_flagged_unconditionally():
    text = (
        "I know Dean Keaton. The guy I know is a cold- + blooded bastard who "
        "was kicked off the force before anyone could stop him."
    )
    r = assess_monologue_quality(text, min_words=5)
    assert "join_artifact" in r.reasons


def test_repair_routes_narrated_film_text_to_ai():
    fake = lambda prompt: '{"monologue": %s, "salvageable": true}' % _json(CLEAN_FIRST_PERSON)
    res = repair_monologue(
        NARRATED,
        character_name="Kujan",
        play_title="The Usual Suspects",
        source_type="film",
        min_words=5,
        check_narration=True,
        invoke=fake,
    )
    assert res.method == "ai"
    assert res.passed_gate is True
    assert "Verbal sees" not in res.cleaned_text


def test_repair_leaves_narrated_text_clean_when_check_disabled():
    # With narration checking off, the text already passes the gate → untouched.
    res = repair_monologue(
        NARRATED,
        character_name="Kujan",
        play_title="The Usual Suspects",
        source_type="play",
        min_words=5,
        check_narration=False,
    )
    assert res.method == "none"


def _json(s: str) -> str:
    import json

    return json.dumps(s)
