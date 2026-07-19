"""Tests for graceful-relaxation ordering.

User report: searching "funny and for women 2 min" surfaced 0:28 pieces.
Cause: relaxation dropped the parsed duration FLOOR first when few strict
matches existed. The floor is the user's explicit intent — it must be the
LAST thing relaxed, and softened (halved), never fully dropped.
"""

import unittest

from app.services.search.semantic_search import RELAX_ORDER, relax_step


class RelaxOrderTests(unittest.TestCase):
    def test_duration_floor_is_relaxed_last(self):
        self.assertEqual(RELAX_ORDER[-1], "min_duration")
        self.assertEqual(set(RELAX_ORDER), {"age_range", "category", "max_duration", "min_duration"})

    def test_large_floor_is_halved_not_dropped(self):
        relaxed = {"min_duration": 120, "gender": "female"}
        relax_step(relaxed, "min_duration")
        self.assertEqual(relaxed["min_duration"], 60)

    def test_tiny_floor_is_dropped(self):
        relaxed = {"min_duration": 40}
        relax_step(relaxed, "min_duration")
        self.assertNotIn("min_duration", relaxed)

    def test_other_keys_are_dropped(self):
        relaxed = {"age_range": "teens", "category": "contemporary"}
        relax_step(relaxed, "age_range")
        self.assertNotIn("age_range", relaxed)
        self.assertIn("category", relaxed)

    def test_missing_key_is_a_noop(self):
        relaxed = {"gender": "male"}
        relax_step(relaxed, "min_duration")
        self.assertEqual(relaxed, {"gender": "male"})


if __name__ == "__main__":
    unittest.main()
