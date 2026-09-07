"""
A bare abstract word has to reach the attribute columns.

`query_type='other'` is 175 of the 272 weak searches, 64% of all failure
(audit, 2026-09-06). "power dynamics" scored 0.294 against a 0.38 relevance
floor and showed an empty stage, while 10,418 monologues carry the theme
`power`. The answer was in a column the vector path never reads.
"""

from unittest.mock import patch

import pytest

from app.services.search import attribute_fallback as af


VOCAB = {
    "themes": {
        "power": 10418,
        "identity": 13401,
        "war": 156,
        "power dynamics": 2,  # the trap: exact but almost empty
        "fantasy": 40,
    },
    "tone": {"sarcastic": 300, "comedic": 900},
    "primary_emotion": {"power": 1, "grief": 400},
}


@pytest.fixture(autouse=True)
def _vocab():
    with patch.object(af, "_load_vocabulary", return_value=VOCAB):
        yield


def detect(q):
    return af.detect_attributes(object(), q)


def test_the_query_that_showed_an_empty_stage_now_routes():
    """'power dynamics' must land on the theme with 10,418 pieces, not the
    two-row theme spelled exactly that, and not the one-row emotion."""
    assert detect("power dynamics") == {"themes": "power"}


def test_only_one_attribute_is_ever_returned():
    """Requiring several at once is what returned zero rows: the query hit a
    rare theme AND an emotion, and no piece carried both."""
    out = detect("power dynamics")
    assert len(out) == 1


def test_a_plain_theme_word_routes():
    assert detect("war") == {"themes": "war"}
    assert detect("identity") == {"themes": "identity"}


def test_a_tone_word_routes_to_tone():
    assert detect("sarcastic") == {"tone": "sarcastic"}


def test_a_word_the_corpus_does_not_use_routes_nowhere():
    """'hopeful' and 'crazy' are not attribute values. They already return
    results through the weak-match path, so hijacking them would be a
    regression, not a fix."""
    assert detect("hopeful") == {}
    assert detect("crazy") == {}


def test_a_title_is_not_an_attribute():
    assert detect("mean girls") == {}


def test_long_queries_are_left_alone():
    """Long queries are the healthiest searches on the platform, 9% weak
    against 45% for a single word. The vector path must keep them."""
    assert detect("a long query about power and betrayal and war deeply felt") == {}


def test_a_thinly_covered_value_is_not_worth_routing_to():
    """Below the coverage floor, the ordinary path is likelier to do better."""
    assert detect("dynamics") == {}


@pytest.mark.parametrize("q", ["", "   ", None])
def test_empty_input_is_safe(q):
    assert detect(q) == {}


def test_it_is_a_fallback_and_returns_nothing_when_nothing_matches():
    rows, matched = af.attribute_search(object(), "mean girls")
    assert rows == []
    assert matched == {}
