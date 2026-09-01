"""Golden tests for monologue extraction.

Three of the four defect classes found on 2026-08-30 reached production and sat
there for months, because nothing checked extraction end to end: a parser
regression stayed invisible until a human happened to read a monologue on the
site. This is that check.

Two layers:

1. **The gate**, against real texts whose verdict a human confirmed. Broken
   cases are the pre-repair text out of the repair backups; clean cases are real
   multi-paragraph speeches from the same audit. The clean half is the important
   half — it is what stops the gate getting greedy and eating Taxi Driver.

2. **The parser**, against synthetic screenplay layouts. These pin the property
   that makes the ScriptSlug path trustworthy and that the retired IMSDb HTML
   path lacked: a cue from a different character ENDS the current speech. Lose
   that and you get #9750 again, a whole scene flattened into one row.

Regenerate the fixture with scripts/build_extraction_golden.py, and only to add
a case someone has actually read.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    has_flattened_scene,
)
from app.services.extraction.screenplay_pdf_parser import segment_screenplay

FIXTURE = Path(__file__).parent / "fixtures" / "extraction_golden.json"
CASES = json.loads(FIXTURE.read_text())

BROKEN = [c for c in CASES if c["expect_flattened_scene"]]
CLEAN = [c for c in CASES if not c["expect_flattened_scene"]]


def _label(case: dict) -> str:
    return f"{case['id']}-{case['note'][:28]}"


class TestGoldenGate:
    def test_fixture_has_both_sides(self):
        """A golden set of only-failures teaches the gate to say no to everything."""
        assert len(BROKEN) >= 5
        assert len(CLEAN) >= 5

    @pytest.mark.parametrize("case", BROKEN, ids=_label)
    def test_known_broken_is_caught(self, case):
        assert has_flattened_scene(case["text"]), (
            f"#{case['id']} ({case['note']}) is a flattened scene and the gate "
            f"missed it"
        )

    @pytest.mark.parametrize("case", CLEAN, ids=_label)
    def test_known_good_survives(self, case):
        assert not has_flattened_scene(case["text"]), (
            f"#{case['id']} ({case['note']}) is a real monologue and the gate "
            f"rejected it — the gate got greedy"
        )

    @pytest.mark.parametrize("case", BROKEN, ids=_label)
    def test_broken_reaches_the_reasons_list(self, case):
        r = assess_monologue_quality(case["text"])
        assert "flattened_scene" in r.reasons
        assert not r.ok


# --- parser layer -----------------------------------------------------------
#
# Synthetic screenplay geometry: cue lines at x0=300, dialogue at x0=222, action
# at x0=100. segment_screenplay derives its bands from the distribution, so the
# exact numbers matter less than their spacing.

CUE_X, DLG_X, ACTION_X = 300, 222, 100
# Clears the 75-word floor AND ends on a full stop — the gate rejects anything
# whose last character is not terminal punctuation (truncated_end).
FILLER = " ".join(["word"] * 80) + "."


def _dialogue(text: str) -> tuple[int, str]:
    return (DLG_X, text)


class TestGoldenParser:
    def test_a_different_speaker_ends_the_speech(self):
        """THE property. Without it, a scene flattens into one row (#9750)."""
        lines = [
            (CUE_X, "ARTHUR"),
            _dialogue(f"I have never been happy. {FILLER}"),
            (CUE_X, "MURRAY"),
            _dialogue(f"That is a terrible thing to say. {FILLER}"),
            (CUE_X, "ARTHUR"),
            _dialogue(f"You asked me a question. {FILLER}"),
        ]
        out = segment_screenplay(lines)
        # _clean_cue_name title-cases, so compare case-insensitively.
        chars = [m["character"].upper() for m in out]
        assert chars.count("ARTHUR") == 2, "Arthur's two speeches must stay apart"
        assert "MURRAY" in chars
        for m in out:
            if m["character"].upper() == "ARTHUR":
                assert "terrible thing to say" not in m["text"]

    def test_contd_resumes_the_same_speaker(self):
        """One speech the page layout split, not two (The Whale's opening)."""
        lines = [
            (CUE_X, "CHARLIE"),
            _dialogue(f"Let me tell you about the essay. {FILLER}"),
            (None, None),  # page break
            (CUE_X, "CHARLIE (CONT'D)"),
            _dialogue("It was the most honest thing I ever read."),
        ]
        out = segment_screenplay(lines)
        assert len(out) == 1
        assert "most honest thing" in out[0]["text"]
        assert "essay" in out[0]["text"]

    def test_action_line_does_not_join_two_speeches(self):
        lines = [
            (CUE_X, "WILLARD"),
            _dialogue(f"I wanted a mission. {FILLER}"),
            (ACTION_X, "He stares at the ceiling fan."),
            (CUE_X, "KURTZ"),
            _dialogue(f"You are an errand boy. {FILLER}"),
        ]
        out = segment_screenplay(lines)
        for m in out:
            if m["character"] == "WILLARD":
                assert "errand boy" not in m["text"]
                assert "ceiling fan" not in m["text"]

    def test_output_passes_the_gate_it_feeds(self):
        """Anything the parser emits must satisfy the gate downstream of it."""
        lines = [
            (CUE_X, "TRAVIS"),
            _dialogue(f"Someday a real rain will come. {FILLER}"),
        ]
        for m in segment_screenplay(lines):
            assert not has_flattened_scene(m["text"])

    def test_unindented_document_yields_nothing(self):
        """No cue band means no reliable speakers — better empty than wrong."""
        assert segment_screenplay([(0, "ARTHUR"), (0, f"Some words. {FILLER}")]) == []
