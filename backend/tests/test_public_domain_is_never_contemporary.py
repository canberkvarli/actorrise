"""A work in the public domain cannot be contemporary, dated or not.

WHERE THIS CAME FROM. Four actors wrote in within four days of 2026-09-13:

    "these arent contemporary"
    "A warm-up contemporary"
    "A more contemporary piece, with a bit of comedy and edge"

They were right, and the cause was one SQL fragment. `era_year_clause` read a
NULL `year_written` as "might be contemporary":

    (p.year_written >= 1980 OR p.year_written IS NULL)

72% of the play corpus has no year -- it is all Gutenberg, so all pre-1930 --
and that clause let every undated row through. 13,661 of the 18,722 monologues
a contemporary search could return, 73%, were provably pre-1930: Sophocles'
Antigone, Schiller's The Robbers, Dekker, Goethe. The search then scored those
results ABOVE its own average confidence, so nothing in the instrumentation
ever flagged it (`weak_match` was 5% on these queries against a 21% baseline).

`copyright_status` settles it with no research and no guessing. A work in the
public domain in 2026 was published before 1930. That column is already trusted
for heavier decisions -- whether text may be stored or served at all, see
`services/licensing` -- so using it as an era signal adds no new risk.

WHY THE COUNT DROPPING IS THE POINT. This takes contemporary-eligible
monologues from 18,722 to 5,061, of which exactly 4 are plays. The previous
comment on the function worried that excluding undated rows would "gut the
catalogue", and it does. But the catalogue was never there: the library has no
contemporary plays, because every contemporary play is in copyright. Showing
Sophocles instead does not fix that, it just moves the disappointment to after
the actor has read 200 words.

So if a future change makes this clause permissive again to bring result counts
back up, it is re-introducing the bug these four people reported.
"""

import unittest

from app.services.search.semantic_search import ERA_CUTOFF_YEAR, era_year_clause


class ContemporaryExcludesPublicDomainTests(unittest.TestCase):
    def test_an_undated_public_domain_row_is_not_contemporary(self):
        sql = era_year_clause("contemporary")
        self.assertIn("IS NULL", sql)
        self.assertIn("public_domain", sql,
                      "an undated row must be judged on its rights, not waved through")

    def test_a_dated_modern_row_still_qualifies_on_its_year(self):
        """The year decides whenever we have one; rights are the NULL fallback."""
        sql = era_year_clause("contemporary")
        self.assertIn(f"p.year_written >= {ERA_CUTOFF_YEAR}", sql)

    def test_classical_still_keeps_undated_rows(self):
        """Undated public-domain work IS classical, so nothing is lost there."""
        sql = era_year_clause("classical")
        self.assertIn("IS NULL", sql)
        self.assertNotIn("public_domain", sql)

    def test_non_era_categories_are_left_alone(self):
        for category in ("comedic", "drama", "", None, 123):
            self.assertIsNone(era_year_clause(category))

    def test_a_list_of_categories_is_ambiguous_and_untouched(self):
        self.assertIsNone(era_year_clause(["contemporary", "classical"]))

    def test_the_columns_are_parameterised_for_both_call_sites(self):
        """title_lookup and semantic_search both alias plays as `p`, but the
        clause must not hardcode that or a third caller silently breaks."""
        sql = era_year_clause("contemporary", year_col="x.yr", rights_col="x.rights")
        self.assertIn("x.yr", sql)
        self.assertIn("x.rights", sql)
        self.assertNotIn("p.year_written", sql)

    def test_a_missing_rights_value_fails_closed_to_contemporary(self):
        """COALESCE, so a NULL copyright_status does not make the whole
        predicate NULL and silently drop the row from BOTH eras."""
        self.assertIn("COALESCE", era_year_clause("contemporary"))


class TheClauseIsValidSqlTests(unittest.TestCase):
    """Balanced parens, because this string is concatenated into a WHERE."""

    def test_parentheses_balance(self):
        for category in ("contemporary", "classical"):
            sql = era_year_clause(category)
            self.assertEqual(sql.count("("), sql.count(")"), category)

    def test_it_is_a_single_bracketed_term(self):
        """It is appended with AND, so it must not leak precedence."""
        for category in ("contemporary", "classical"):
            sql = era_year_clause(category)
            self.assertTrue(sql.startswith("(") and sql.endswith(")"), category)


if __name__ == "__main__":
    unittest.main()
