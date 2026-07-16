"""Duration-intent parsing for search queries.

Regression cover for the "Monologo comico di 5 minuti returned 25-second
monologues" bug: Italian "minuti" now parses, and a bare "X minutes" is a
window (floor + ceiling), not a bare ceiling that lets tiny clips through.
"""

import unittest

from app.services.search.query_optimizer import KeywordExtractor


class DurationExtractionTests(unittest.TestCase):
    def _dur(self, q):
        f = KeywordExtractor.extract(q)
        return f.get("min_duration"), f.get("max_duration")

    def test_italian_5_minuti_gets_a_floor(self):
        # The actual failing query. Must exclude 25-second clips.
        mn, mx = self._dur("monologo comico di 5 minuti")
        self.assertEqual(mx, 300)
        self.assertEqual(mn, 150)

    def test_english_bare_target_is_window(self):
        self.assertEqual(self._dur("5 minute monologue"), (150, 300))

    def test_hyphenated_target(self):
        self.assertEqual(self._dur("a 5-minute piece"), (150, 300))

    def test_explicit_ceiling_has_no_floor(self):
        mn, mx = self._dur("under 2 minutes")
        self.assertEqual(mx, 120)
        self.assertIsNone(mn)

    def test_at_least_is_a_floor(self):
        mn, mx = self._dur("at least 3 minutes")
        self.assertEqual(mn, 180)

    def test_range(self):
        self.assertEqual(self._dur("2-3 minute monologue"), (120, 180))

    def test_spanish_minutos(self):
        _, mx = self._dur("monologo de 2 minutos")
        self.assertEqual(mx, 120)

    def test_seconds_ceiling(self):
        _, mx = self._dur("30 second monologue")
        self.assertEqual(mx, 30)

    def test_no_duration_intent(self):
        self.assertEqual(self._dur("angry monologue about revenge"), (None, None))


if __name__ == "__main__":
    unittest.main()
