"""Fingerprinting for cross-source duplicate detection.

The vector half needs a database and is exercised by the ingest scripts; these
cover the fingerprint, which is the half that has to be exactly right — it is
what decides that two rows are the SAME speech and one should be discarded.
"""

from __future__ import annotations

import pytest

from app.services.data_ingestion.cross_source_dedupe import (
    DUPLICATE_DISTANCE,
    text_fingerprint,
)

BASE = "To be, or not to be, that is the question."


class TestFingerprint:
    @pytest.mark.parametrize("variant", [
        "to be, or not to be, that is the question.",      # case
        "To be or not to be that is the question",          # punctuation
        "To  be,   or  not  to  be,\nthat is the question.",  # whitespace
        "To be, or not to be, that is the question!",       # terminal mark
        "“To be, or not to be, that is the question.”",     # smart quotes
    ])
    def test_typesetting_differences_collapse(self, variant):
        """Sources differ in how they set the same words; that is not a new piece."""
        assert text_fingerprint(variant) == text_fingerprint(BASE)

    def test_different_words_do_not_collapse(self):
        assert text_fingerprint(BASE) != text_fingerprint(
            "To be, or not to be, that is the answer."
        )

    def test_a_missing_word_is_a_different_fingerprint(self):
        """The hash is exact by design — near-misses are the vector half's job."""
        assert text_fingerprint(BASE) != text_fingerprint(
            "To be, or not to be, that is question."
        )

    def test_empty_and_none(self):
        assert text_fingerprint("") == text_fingerprint(None)
        assert text_fingerprint("   \n  ") == text_fingerprint("")

    def test_stable_across_runs(self):
        """Checked into backups and compared over time, so it cannot drift."""
        assert text_fingerprint("hello world") == text_fingerprint("Hello, World!")
        assert len(text_fingerprint(BASE)) == 32  # md5 hex

    def test_matches_the_sql_twin_shape(self):
        """The SQL expression lowercases then strips [^a-z0-9]; digits survive."""
        assert text_fingerprint("Room 101.") == text_fingerprint("room101")


class TestThreshold:
    def test_threshold_is_inside_the_calibrated_gap(self):
        """Median nearest-neighbour distance on the live corpus is ~0.19, and
        every pair inspected below 0.03 was the same speech. The threshold must
        stay well under that median or it starts merging distinct monologues."""
        assert 0 < DUPLICATE_DISTANCE <= 0.03
