"""Tests for the golden-query harness scorer.

The harness (scripts/run_golden_search.py) replays ~50 real user queries from
the 2026-07 search audit and checks graded expectations, so relevance changes
can't silently regress. score_query() is the pure scoring core: it compares an
expectation block against what the search actually did.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from run_golden_search import score_query  # noqa: E402


def _result(play="Hamlet", author="Shakespeare", gender="female", dur=90):
    return {"play_title": play, "author": author, "gender": gender, "duration_s": dur}


class ScoreQueryTests(unittest.TestCase):
    def _fails(self, checks):
        return [name for name, ok, _ in checks if not ok]

    def test_no_expectations_yields_no_checks(self):
        self.assertEqual(score_query({}, {"results": [], "total": 0}), [])

    def test_min_results_pass_and_fail(self):
        obs = {"results": [_result()] * 3, "total": 3}
        self.assertEqual(self._fails(score_query({"min_results": 3}, obs)), [])
        self.assertEqual(self._fails(score_query({"min_results": 5}, obs)), ["min_results"])

    def test_expect_strong_fails_on_weak_match(self):
        obs = {"results": [_result()], "total": 1, "weak": True}
        self.assertEqual(self._fails(score_query({"expect_strong": True}, obs)), ["expect_strong"])
        obs["weak"] = False
        self.assertEqual(self._fails(score_query({"expect_strong": True}, obs)), [])

    def test_parse_expectations_check_subset_of_extracted_filters(self):
        obs = {"results": [], "total": 0,
               "parsed": {"gender": "female", "min_duration": 150, "max_duration": 300, "tone": "comedic"}}
        exp = {"parse": {"gender": "female", "max_duration": 300}}
        self.assertEqual(self._fails(score_query(exp, obs)), [])
        exp = {"parse": {"gender": "male"}}
        self.assertEqual(self._fails(score_query(exp, obs)), ["parse.gender"])

    def test_parse_expectation_of_null_means_key_absent(self):
        obs = {"results": [], "total": 0, "parsed": {"max_duration": 120}}
        self.assertEqual(self._fails(score_query({"parse": {"min_duration": None}}, obs)), [])
        obs["parsed"]["min_duration"] = 60
        self.assertEqual(self._fails(score_query({"parse": {"min_duration": None}}, obs)), ["parse.min_duration"])

    def test_top_author_ilike_looks_at_first_five_results(self):
        obs = {"results": [_result(author="Oscar Wilde")] + [_result(author="X")] * 5, "total": 6}
        self.assertEqual(self._fails(score_query({"top_author_ilike": "wilde"}, obs)), [])
        obs = {"results": [_result(author="X")] * 6 + [_result(author="Oscar Wilde")], "total": 7}
        self.assertEqual(self._fails(score_query({"top_author_ilike": "wilde"}, obs)), ["top_author_ilike"])

    def test_top_play_ilike(self):
        obs = {"results": [_result(play="A Doll's House")], "total": 1}
        self.assertEqual(self._fails(score_query({"top_play_ilike": "doll's house"}, obs)), [])

    def test_results_gender_allows_any_and_none(self):
        obs = {"results": [_result(gender="female"), _result(gender="any"), _result(gender=None)], "total": 3}
        self.assertEqual(self._fails(score_query({"results_gender": "female"}, obs)), [])
        obs["results"].append(_result(gender="male"))
        self.assertEqual(self._fails(score_query({"results_gender": "female"}, obs)), ["results_gender"])

    def test_results_max_duration_tolerates_ten_percent(self):
        obs = {"results": [_result(dur=125)], "total": 1}
        self.assertEqual(self._fails(score_query({"results_max_duration_s": 120}, obs)), [])
        obs = {"results": [_result(dur=200)], "total": 1}
        self.assertEqual(self._fails(score_query({"results_max_duration_s": 120}, obs)), ["results_max_duration_s"])

    def test_gap_play_ilike_checks_content_gap(self):
        obs = {"results": [], "total": 0, "content_gap": {"play": "Bridgerton", "author": None}}
        self.assertEqual(self._fails(score_query({"gap_play_ilike": "bridgerton"}, obs)), [])
        obs["content_gap"] = None
        self.assertEqual(self._fails(score_query({"gap_play_ilike": "bridgerton"}, obs)), ["gap_play_ilike"])


if __name__ == "__main__":
    unittest.main()
