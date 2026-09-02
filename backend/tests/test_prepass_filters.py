"""The title pre-pass must not stand down over a filter it could honour.

Naming a show is a lookup, not a similarity question. `find_title_monologues`
answers it directly, and `prepass_can_honour` is the fail-closed guard in front:
if ANY active filter is one the pre-pass does not implement, it refuses rather
than quietly ignoring that filter.

Fail-closed is right. The cost is that a key missing from
`_PREPASS_SUPPORTED_FILTERS` is invisible — the actor just gets a worse answer.
`category` and `author` were both missing, and both are things the search API
sets, so "mean girls" with a classical/contemporary toggle on abandoned the 8
pieces we hold and asked the vector index what a bare show name resembles. It
came back weak, as it always will: a show's name rarely appears in its own
dialogue.
"""

import unittest

from app.services.search.title_lookup import (
    _PREPASS_SUPPORTED_FILTERS,
    prepass_can_honour,
)

# Everything app/api/monologues.py can put in `filters`.
API_FILTER_KEYS = {
    "gender", "age_range", "emotion", "theme", "difficulty", "tone",
    "category", "author", "act", "scene", "max_duration",
    "max_overdone_score", "source_type",
}


class SupportedFilterTests(unittest.TestCase):
    def test_category_and_author_are_honoured(self):
        """Both are plays columns, filtered in the pre-pass's own query."""
        self.assertTrue(prepass_can_honour({"category": "contemporary"}, "Mean Girls"))
        self.assertTrue(prepass_can_honour({"author": "Shakespeare"}, "Hamlet"))

    def test_a_combination_is_honoured(self):
        self.assertTrue(prepass_can_honour(
            {"gender": "female", "category": "contemporary"}, "Mean Girls"))

    def test_an_unimplemented_filter_still_stands_down(self):
        """`theme` is an array column on monologues and is NOT implemented.

        Standing down is the honest answer — returning the show's pieces while
        ignoring the filter would be worse than falling through.
        """
        self.assertFalse(prepass_can_honour({"theme": "friendship"}, "Mean Girls"))
        self.assertNotIn("theme", _PREPASS_SUPPORTED_FILTERS)

    def test_no_filters_is_always_honoured(self):
        self.assertTrue(prepass_can_honour(None, "Mean Girls"))
        self.assertTrue(prepass_can_honour({}, "Mean Girls"))

    def test_every_unsupported_key_is_a_deliberate_omission(self):
        """Anything the API can set and the pre-pass cannot is a silent cost.

        This test exists to make adding a new filter to the API a conscious
        decision about the pre-pass, rather than a quiet regression that only
        shows up as more weak searches on the admin page.
        """
        unsupported = API_FILTER_KEYS - _PREPASS_SUPPORTED_FILTERS
        self.assertEqual(
            unsupported, {"theme"},
            "a search filter the pre-pass does not implement stands the whole "
            "title lookup down; implement it in find_title_monologues or "
            "record it here as a known omission",
        )


class AmbiguousTitleTests(unittest.TestCase):
    """A one-word title that is also a descriptor defers under filters."""

    def test_a_distinctive_one_word_title_is_still_honoured(self):
        self.assertTrue(prepass_can_honour({"gender": "male"}, "Hamlet"))
        self.assertTrue(prepass_can_honour({"gender": "female"}, "Fleabag"))


if __name__ == "__main__":
    unittest.main()
