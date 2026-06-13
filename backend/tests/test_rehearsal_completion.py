"""Tests for rehearsal-session completion math.

Regression: completion used to divide the user's delivered-line counter by the
scene's TOTAL line count (user + AI lines). Since an actor only delivers their
own character's lines (~half a scene), completion_percentage capped near 50% and
the "completed" status was mathematically unreachable — every finished rehearsal
stayed "in_progress" (e.g. session 262: JORDAN delivered all 6 of 6 JORDAN lines
in an 11-line scene, shown as 54.5% in_progress).

Completion must be measured against the user's OWN lines: an actor who delivers
every line of their character has finished the scene.
"""

import unittest

from app.api.scenes import _compute_completion


class ComputeCompletionTests(unittest.TestCase):
    def test_delivered_all_own_lines_is_complete(self):
        # Session 262 smoking gun: 6 of 6 JORDAN lines (11-line scene) → done.
        pct, done = _compute_completion(total_delivered=6, user_line_count=6)
        self.assertEqual(pct, 100.0)
        self.assertTrue(done)

    def test_delivered_all_own_lines_long_scene(self):
        # Session 268: Bill delivered 23 of 23 in a 45-line scene → done.
        pct, done = _compute_completion(total_delivered=23, user_line_count=23)
        self.assertEqual(pct, 100.0)
        self.assertTrue(done)

    def test_partway_through_is_not_complete(self):
        # Session 236: 5 of 6 lines → ~83%, not done.
        pct, done = _compute_completion(total_delivered=5, user_line_count=6)
        self.assertAlmostEqual(pct, 83.3, places=1)
        self.assertFalse(done)

    def test_overdelivery_caps_at_100(self):
        # Retries shouldn't push past 100% or un-complete a finished scene.
        pct, done = _compute_completion(total_delivered=8, user_line_count=6)
        self.assertEqual(pct, 100.0)
        self.assertTrue(done)

    def test_zero_user_lines_does_not_divide_by_zero(self):
        pct, done = _compute_completion(total_delivered=0, user_line_count=0)
        self.assertEqual(pct, 0.0)
        self.assertFalse(done)

    def test_fresh_session_is_not_complete(self):
        pct, done = _compute_completion(total_delivered=0, user_line_count=6)
        self.assertEqual(pct, 0.0)
        self.assertFalse(done)


if __name__ == "__main__":
    unittest.main()
