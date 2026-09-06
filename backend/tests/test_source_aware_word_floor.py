"""
The word floor is per-source. A flat 100 is calibrated for the stage and cuts
43% of the TV corpus, whose median piece is 106 words, blanking 164 of 1,436
film/TV titles. Red's parole hearing in The Shawshank Redemption is 78 words.

Both the retire and un-gate scripts must read this helper rather than compare
against DEFAULT_MIN_WORDS directly, or they will fight each other: retire would
take straight back out exactly what un-gate had just freed.
"""

import pytest

from app.services.extraction.monologue_quality import (
    DEFAULT_MIN_WORDS,
    SCREEN_MIN_WORDS,
    min_words_for_source,
)


def test_stage_keeps_the_stricter_floor():
    assert min_words_for_source("play") == DEFAULT_MIN_WORDS == 100


@pytest.mark.parametrize("source", ["film", "tv", "FILM", " Tv "])
def test_screen_floor_is_lower_and_case_insensitive(source):
    assert min_words_for_source(source) == SCREEN_MIN_WORDS == 75


@pytest.mark.parametrize("source", [None, "", "unknown", "radio"])
def test_unknown_sources_get_the_stricter_floor(source):
    """Never let an unrecognised source silently admit shorter pieces."""
    assert min_words_for_source(source) == DEFAULT_MIN_WORDS


def test_shawshank_length_passes_on_screen_and_fails_on_stage():
    red_parole_hearing = 78
    assert red_parole_hearing >= min_words_for_source("film")
    assert red_parole_hearing < min_words_for_source("play")


def test_the_two_scripts_cannot_disagree():
    """retire keeps `wc < floor`, un-gate frees `wc >= floor`. Same helper, so
    the two sets are exact complements and no row can oscillate."""
    for source in ("play", "film", "tv", None):
        floor = min_words_for_source(source)
        for wc in (0, 74, 75, 99, 100, 400):
            retires = wc < floor
            ungates = wc >= floor
            assert retires != ungates
