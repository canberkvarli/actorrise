"""Tests for the era (year_written) correction on top of the category filter.

plays.category is only ever 'contemporary' or 'classical', so it already acts as
the era filter — but the labels are dirty: a bare "contemporary" search returned
20 plays all written in 1920 because those rows are mislabeled 'contemporary'.
era_year_clause layers year_written on top to exclude the provably-wrong ones,
while KEEPING unknown-year rows (the category label is all we have for those).
"""

import unittest

from app.services.search.semantic_search import ERA_CUTOFF_YEAR, era_year_clause


class EraYearClauseTests(unittest.TestCase):
    def test_contemporary_excludes_known_pre_cutoff_keeps_unknown(self):
        clause = era_year_clause("contemporary")
        self.assertIn(f">= {ERA_CUTOFF_YEAR}", clause)
        self.assertIn("IS NULL", clause)  # unknown-year rows are kept

    def test_classical_excludes_known_modern_keeps_unknown(self):
        clause = era_year_clause("classical")
        self.assertIn(f"< {ERA_CUTOFF_YEAR}", clause)
        self.assertIn("IS NULL", clause)

    def test_non_era_category_yields_no_clause(self):
        self.assertIsNone(era_year_clause("comedy"))
        self.assertIsNone(era_year_clause(None))
        self.assertIsNone(era_year_clause(["contemporary", "classical"]))

    def test_clause_uses_the_given_column(self):
        self.assertIn("plays.year_written", era_year_clause("contemporary", "plays.year_written"))


if __name__ == "__main__":
    unittest.main()
