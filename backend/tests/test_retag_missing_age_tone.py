"""The parser that stands between the model and the corpus.

An untagged row is not merely undecorated — it is unreachable, because age and
tone are how an actor narrows 19,000 pieces. So the failure mode that matters
here is not "no value written", it is "a value written that no filter asks
for", which looks fixed and is not. Every assertion below is about that.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from retag_missing_age_tone import (  # noqa: E402
    ALLOWED_AGES,
    ALLOWED_TONES,
    _needs_work,
    parse_tags,
)


class _Row:
    def __init__(self, age=None, tone=None):
        self.character_age_range = age
        self.tone = tone


def _reply(tags):
    return json.dumps({"tags": tags})


class TestParseTags:
    def test_keeps_a_good_pair(self):
        got = parse_tags(_reply([{"id": 7, "age_range": "20-30", "tone": "anguished"}]))
        assert got == {7: {"age_range": "20-30", "tone": "anguished"}}

    def test_drops_an_off_vocabulary_tone(self):
        # "determined" and "mystical" are in the corpus at one row each, the
        # residue of an ingest that invented its own words. Writing another
        # one writes the row back out of the filters.
        got = parse_tags(_reply([{"id": 7, "age_range": "20-30", "tone": "determined"}]))
        assert got == {7: {"age_range": "20-30"}}

    def test_drops_an_off_vocabulary_age(self):
        got = parse_tags(_reply([{"id": 7, "age_range": "young adult", "tone": "dark"}]))
        assert got == {7: {"tone": "dark"}}

    def test_a_row_with_nothing_usable_is_omitted_entirely(self):
        assert parse_tags(_reply([{"id": 7, "age_range": "??", "tone": "??"}])) == {}

    def test_case_and_padding_fold(self):
        got = parse_tags(_reply([{"id": 7, "age_range": " 20-30 ", "tone": "  Anguished "}]))
        assert got == {7: {"age_range": "20-30", "tone": "anguished"}}

    def test_survives_junk(self):
        assert parse_tags("not json") == {}
        assert parse_tags(None) == {}
        assert parse_tags(json.dumps({})) == {}
        assert parse_tags(json.dumps({"tags": None})) == {}

    def test_skips_rows_with_an_unusable_id(self):
        got = parse_tags(_reply([
            {"id": "x", "age_range": "20s", "tone": "dark"},
            {"age_range": "20s", "tone": "dark"},
            {"id": 9, "age_range": "20s", "tone": "dark"},
        ]))
        assert list(got) == [9]

    def test_vocabularies_come_from_the_shared_file(self):
        # Not redefined here; a local copy is how the two drift apart.
        from app.services.search.vocabulary import (CORPUS_AGE_VALUES,
                                                    CORPUS_TONE_VALUES)
        assert ALLOWED_AGES == set(CORPUS_AGE_VALUES)
        assert ALLOWED_TONES == set(CORPUS_TONE_VALUES)
        assert "determined" not in ALLOWED_TONES


class TestNeedsWork:
    def test_empty_and_null_count_as_missing(self):
        assert _needs_work(_Row(None, None)) == {"age": True, "tone": True}
        assert _needs_work(_Row("  ", "  ")) == {"age": True, "tone": True}

    def test_any_counts_as_a_missing_age(self):
        # "any" is what the ingest wrote when it had nothing to say, and no
        # profile band maps to it, so the row is unreachable either way.
        assert _needs_work(_Row("any", "dark"))["age"] is True

    def test_unknown_counts_as_a_missing_tone(self):
        assert _needs_work(_Row("20s", "unknown"))["tone"] is True

    def test_real_values_are_left_alone(self):
        # This fills gaps; it does not re-judge tagging somebody already did.
        assert _needs_work(_Row("20-30", "anguished")) == {"age": False, "tone": False}
