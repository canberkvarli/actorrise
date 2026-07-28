"""Tests for excluding review-queued monologues from search.

Latent bug found 2026-07-21: review_status='pending' (set by the repair/quality
passes to pull a broken piece OUT of circulation for fixing) was used only by
the admin review queue — the search path never checked it, so a piece flagged
as broken was still served to users. This predicate is the single source of
truth for "hide from search because it's awaiting review"; the SQL filters in
the search query builders enforce the same rule.
"""

import unittest

from app.services.search.semantic_search import review_hides_from_search


class ReviewStatusGateTests(unittest.TestCase):
    def test_pending_is_hidden(self):
        self.assertTrue(review_hides_from_search("pending"))

    def test_none_is_shown(self):
        self.assertFalse(review_hides_from_search(None))

    def test_resolved_or_other_status_is_shown(self):
        # Only the explicit "pending" state hides a piece; anything else shows.
        self.assertFalse(review_hides_from_search(""))
        self.assertFalse(review_hides_from_search("approved"))


if __name__ == "__main__":
    unittest.main()
