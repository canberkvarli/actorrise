"""
The Plays / Film & TV tab always sends source_type. It used to land in the same
dict as hand-picked filters, and `search()` skips AI parsing whenever that dict
is non-empty, so the AI query parse AND its spell-corrector were off on 96% of
production searches (894 of 932 in the 30 days to 2026-09-06).

A filter the UI sets on the actor's behalf must not suppress the parse. One the
actor actually picked still must, because that is the cost saving the skip
exists for.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.services.search.semantic_search import _MODE_ONLY_FILTERS


def test_source_type_is_the_mode_filter():
    assert "source_type" in _MODE_ONLY_FILTERS
    # Anything the actor picks by hand must NOT be in here.
    for k in ("gender", "age_range", "emotion", "theme", "tone", "difficulty"):
        assert k not in _MODE_ONLY_FILTERS


def _ai_would_run(explicit_filters):
    """Mirror of the branch condition in SemanticSearch.search."""
    actor_chosen = {
        k: v for k, v in explicit_filters.items() if k not in _MODE_ONLY_FILTERS
    }
    return not actor_chosen


@pytest.mark.parametrize(
    "filters,should_run,why",
    [
        ({}, True, "no filters at all"),
        ({"source_type": "play"}, True, "Plays tab only — the 96% case"),
        ({"source_type": "film,tv"}, True, "Film & TV tab only"),
        ({"gender": "female"}, False, "actor picked a gender"),
        ({"source_type": "play", "gender": "female"}, False, "tab + real filter"),
        ({"source_type": "play", "max_duration": 90}, False, "tab + real filter"),
    ],
)
def test_only_actor_chosen_filters_suppress_the_ai_parse(filters, should_run, why):
    assert _ai_would_run(filters) is should_run, why
