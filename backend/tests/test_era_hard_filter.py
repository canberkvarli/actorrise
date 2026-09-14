"""Tests for the era (year_written) correction on top of the category filter.

plays.category is only ever 'contemporary' or 'classical', so it already acts as
the era filter — but the labels are dirty: a bare "contemporary" search returned
20 plays all written in 1920 because those rows are mislabeled 'contemporary'.
era_year_clause layers year_written on top to exclude the provably-wrong ones,
while KEEPING unknown-year rows (the category label is all we have for those).
"""

import unittest

from app.services.search.semantic_search import (ERA_CUTOFF_YEAR,
                                                 MODERN_START_YEAR,
                                                 era_uses_stored_category,
                                                 era_year_clause)


class EraYearClauseTests(unittest.TestCase):
    def test_contemporary_excludes_known_pre_cutoff_keeps_unknown(self):
        clause = era_year_clause("contemporary")
        self.assertIn(f">= {ERA_CUTOFF_YEAR}", clause)
        self.assertIn("IS NULL", clause)  # unknown-year rows are kept

    def test_classical_now_stops_at_ibsen_not_at_1980(self):
        """The boundary moved on 2026-09-14, deliberately.

        With two eras, 'classical' meant everything before 1980, which put
        Ibsen, Chekhov, Shaw and Wilde in the same bucket as Sophocles. Those
        are modern drama, and once 503 works were dated there were 5,152
        monologues that could finally be told apart. An actor asking for a
        classical piece wants verse and antiquity; asking for Chekhov, they now
        type 'modern' and the vocabulary routes it there.
        """
        clause = era_year_clause("classical")
        self.assertIn(f"< {MODERN_START_YEAR}", clause)
        self.assertNotIn(f"< {ERA_CUTOFF_YEAR}", clause)
        self.assertIn("IS NULL", clause,
                      "2,078 monologues are still undated and are almost all "
                      "pre-Ibsen; dropping them from classical would lose them")

    def test_modern_is_the_band_between_the_two(self):
        clause = era_year_clause("modern")
        self.assertIn(f">= {MODERN_START_YEAR}", clause)
        self.assertIn(f"< {ERA_CUTOFF_YEAR}", clause)

    def test_modern_refuses_undated_rows(self):
        """The one era that will not guess.

        An undated public-domain row could be Sophocles or it could be Chekhov.
        Classical keeps them because that is where nearly all of them belong;
        contemporary keeps undated NON-public-domain rows for the same reason.
        Modern sits between and has no safe default, so it takes only rows that
        carry a real year.
        """
        self.assertNotIn("IS NULL", era_year_clause("modern"))

    def test_modern_is_not_filtered_on_the_stored_label(self):
        """plays.category only ever holds classical/contemporary.

        Filtering the column for 'modern' matches zero rows, so every call site
        has to ask this before adding the label predicate.
        """
        self.assertFalse(era_uses_stored_category("modern"))
        self.assertTrue(era_uses_stored_category("classical"))
        self.assertTrue(era_uses_stored_category("contemporary"))
        self.assertTrue(era_uses_stored_category(["modern", "classical"]),
                        "a list is ambiguous and keeps the old label behaviour")

    def test_the_three_eras_do_not_overlap_or_leave_a_gap(self):
        """Every dated year belongs to exactly one era.

        The boundaries are checked as numbers rather than by evaluating the SQL
        string, and `test_the_clauses_carry_these_boundaries` then confirms the
        SQL actually embeds them. Two cheap assertions beat one clever one.
        """
        def era_of(year: int) -> str:
            if year < MODERN_START_YEAR:
                return "classical"
            if year < ERA_CUTOFF_YEAR:
                return "modern"
            return "contemporary"

        cases = {
            -441: "classical", 1600: "classical", 1878: "classical",
            1879: "modern", 1900: "modern", 1979: "modern",
            1980: "contemporary", 2020: "contemporary",
        }
        for year, expected in cases.items():
            self.assertEqual(era_of(year), expected, f"year {year}")

    def test_the_clauses_carry_these_boundaries(self):
        """The SQL must use the same two numbers the partition above assumes."""
        self.assertIn(f"< {MODERN_START_YEAR}", era_year_clause("classical"))
        self.assertIn(f">= {MODERN_START_YEAR}", era_year_clause("modern"))
        self.assertIn(f"< {ERA_CUTOFF_YEAR}", era_year_clause("modern"))
        self.assertIn(f">= {ERA_CUTOFF_YEAR}", era_year_clause("contemporary"))

    def test_a_dolls_house_lands_in_modern(self):
        """1879 is the boundary BECAUSE of this play; off by one and it moves."""
        self.assertGreaterEqual(1879, MODERN_START_YEAR)

    def test_non_era_category_yields_no_clause(self):
        self.assertIsNone(era_year_clause("comedy"))
        self.assertIsNone(era_year_clause(None))
        self.assertIsNone(era_year_clause(["contemporary", "classical"]))

    def test_clause_uses_the_given_column(self):
        self.assertIn("plays.year_written", era_year_clause("contemporary", "plays.year_written"))


if __name__ == "__main__":
    unittest.main()
