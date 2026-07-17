"""Tests for the TV-clip search gate.

68% of TV monologues (1,492/2,192) are under 30 seconds — line readings, not
monologues. They pollute every search that touches TV content. The gate hides
them from search results UNLESS the user explicitly asked for very short
pieces (an explicit max_duration at or under 45s).
"""

import unittest

from app.services.search.semantic_search import (
    TV_CLIP_MIN_SECONDS,
    tv_clip_gate_active,
)


class TvClipGateTests(unittest.TestCase):
    def test_gate_is_on_by_default(self):
        self.assertTrue(tv_clip_gate_active(None))
        self.assertTrue(tv_clip_gate_active({}))

    def test_gate_is_on_for_normal_duration_filters(self):
        self.assertTrue(tv_clip_gate_active({"max_duration": 120}))
        self.assertTrue(tv_clip_gate_active({"min_duration": 60, "max_duration": 120}))

    def test_gate_lifts_when_user_asks_for_very_short(self):
        self.assertFalse(tv_clip_gate_active({"max_duration": 45}))
        self.assertFalse(tv_clip_gate_active({"max_duration": 30}))

    def test_threshold_is_thirty_seconds(self):
        self.assertEqual(TV_CLIP_MIN_SECONDS, 30)


if __name__ == "__main__":
    unittest.main()
