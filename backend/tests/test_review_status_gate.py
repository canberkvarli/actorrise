"""Tests for excluding review-queued monologues from search.

Latent bug found 2026-07-21: review_status='pending' (set by the repair/quality
passes to pull a broken piece OUT of circulation for fixing) was used only by
the admin review queue — the search path never checked it, so a piece flagged
as broken was still served to users. This predicate is the single source of
truth for "hide from search because it's awaiting review"; the SQL filters in
the search query builders enforce the same rule.
"""

import unittest

from app.services.search.semantic_search import (
    HIDDEN_REVIEW_STATUSES,
    review_hides_from_search,
)


class ReviewStatusGateTests(unittest.TestCase):
    def test_pending_is_hidden(self):
        self.assertTrue(review_hides_from_search("pending"))

    def test_none_is_shown(self):
        self.assertFalse(review_hides_from_search(None))

    def test_unknown_status_is_shown(self):
        # Hiding is opt-in by exact name. A status nobody recognises must show,
        # or a typo anywhere silently empties the library.
        self.assertFalse(review_hides_from_search(""))
        self.assertFalse(review_hides_from_search("approved"))


class RetirementStatusTests(unittest.TestCase):
    """Three reasons to hide a row, kept apart so each stays countable.

    'pending' feeds /admin/monologues/review, and it is the one a human has to
    work through. Retiring six thousand clip-length rows into that same status
    would have buried the handful that actually need reading, which is why
    'too_short' and 'not_monologue' exist alongside it rather than reusing it.
    """

    def test_all_three_hide(self):
        for status in ("pending", "too_short", "not_monologue"):
            with self.subTest(status=status):
                self.assertTrue(review_hides_from_search(status))

    def test_the_set_is_exactly_these_three(self):
        self.assertEqual(
            HIDDEN_REVIEW_STATUSES,
            frozenset({"pending", "too_short", "not_monologue"}),
        )

    def test_only_pending_belongs_to_the_admin_queue(self):
        """The other two are decisions, not questions — nobody reviews them."""
        self.assertIn("pending", HIDDEN_REVIEW_STATUSES)
        self.assertNotIn("too_short", {"pending"})
        self.assertNotIn("not_monologue", {"pending"})


if __name__ == "__main__":
    unittest.main()
