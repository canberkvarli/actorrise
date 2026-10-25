"""Shelf labels: whatever the model says, only known values are stored."""

import json

from app.services import shelf_labels as sl


class _Reply:
    def __init__(self, content):
        self.content = content


class _LLM:
    def __init__(self, payload):
        self.payload = payload
        self.prompt = None

    def invoke(self, prompt):
        self.prompt = prompt
        return _Reply(self.payload)


LINES = [{"character": "Nora", "text": "I am leaving you."}, {"character": "Helmer", "text": "Nora."}]


def test_a_good_answer_is_kept():
    llm = _LLM(json.dumps({
        "title": "Nora leaves", "description": "She goes.", "tone": "Dramatic",
        "character_1_gender": "female", "character_2_gender": "male",
        "character_1_age_range": "30s", "character_2_age_range": "30s", "standalone": 0.9,
    }))
    out = sl.label("A Doll's House", "Ibsen", "Nora", "Helmer", LINES, llm=llm)
    assert out["tone"] == "dramatic"
    assert out["character_2_gender"] == "male"
    assert out["standalone"] == 0.9
    assert "Nora: I am leaving you." in llm.prompt


def test_unknown_values_fall_back():
    out = sl.label("X", "Y", "A", "B", LINES, llm=_LLM(json.dumps({
        "tone": "melancholy-ish", "character_1_gender": "robot",
        "character_1_age_range": "ancient", "standalone": "very",
    })))
    assert out["tone"] is None
    assert out["character_1_gender"] == "any"
    assert out["character_1_age_range"] == "any"
    assert out["standalone"] == 0.0
    assert out["title"] is None


def test_a_broken_answer_is_not_a_crash():
    out = sl.label("X", "Y", "A", "B", LINES, llm=_LLM("not json"))
    assert out["standalone"] == 0.0


def test_era():
    assert sl.era_for(1600, None) == "classical"
    assert sl.era_for(1879, None) == "modern"
    assert sl.era_for(None, "contemporary") == "modern"
    assert sl.era_for(None, "classical") == "classical"
