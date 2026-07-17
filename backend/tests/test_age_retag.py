"""Tests for the classical age re-tag parser.

46% of the corpus (2,141 classical pieces) carries the default-smelling
"30-40" age tag, which breaks age filtering and hides teen-appropriate
classical pieces. The AI re-tagger must only ever write canonical age values
the search filter system understands.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from retag_classical_ages import ALLOWED_AGES, parse_ages  # noqa: E402


class ParseAgesTests(unittest.TestCase):
    def test_valid_payload(self):
        raw = '{"ages": [{"id": 1, "age_range": "teens"}, {"id": 2, "age_range": "60+"}]}'
        self.assertEqual(parse_ages(raw), {1: "teens", 2: "60+"})

    def test_non_canonical_value_is_dropped(self):
        raw = '{"ages": [{"id": 1, "age_range": "young adult"}, {"id": 2, "age_range": "20s"}]}'
        self.assertEqual(parse_ages(raw), {2: "20s"})

    def test_bad_json_returns_empty(self):
        self.assertEqual(parse_ages("not json"), {})
        self.assertEqual(parse_ages(None), {})

    def test_malformed_rows_are_skipped(self):
        raw = '{"ages": [{"id": "x", "age_range": "20s"}, {"age_range": "30s"}, {"id": 3, "age_range": "40s"}]}'
        self.assertEqual(parse_ages(raw), {3: "40s"})

    def test_allowed_set_matches_search_filter_vocabulary(self):
        self.assertEqual(
            ALLOWED_AGES,
            {"child", "teens", "20s", "20-30", "30s", "30-40", "40s", "40-50", "50s", "60+", "any"},
        )


if __name__ == "__main__":
    unittest.main()
