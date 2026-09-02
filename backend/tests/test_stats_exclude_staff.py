"""Staff use must not show up in user-facing numbers.

`/api/public/stats` feeds the landing page: "N monologues found by actors" and
"N actors are using ActorRise". Both counted every account, so the founder
testing his own search all day was indistinguishable from demand — 1,144 of
3,853 searches, 30% of the headline figure, came from three staff accounts.

The flag is `exclude_from_stats`, deliberately NOT `is_moderator`. Moderating is
a permission a real community member could be given, and when that happens they
are still a user and still count. Conflating the two would quietly delete a real
person from the numbers the day they were made a moderator.

Admin dashboards are untouched on purpose: there the founder's own activity is
real activity and hiding it would make the tool lie to the person using it.
"""

import ast
import inspect
import unittest
from pathlib import Path

from app.api import public
from app.models.user import User


class ColumnTests(unittest.TestCase):
    def test_the_flag_exists_and_is_off_by_default(self):
        col = User.__table__.c.exclude_from_stats
        self.assertFalse(col.nullable)
        self.assertIs(col.default.arg, False)

    def test_it_is_separate_from_is_moderator(self):
        """Two different questions: 'may they review?' and 'do they count?'."""
        self.assertIn("is_moderator", User.__table__.c)
        self.assertIn("exclude_from_stats", User.__table__.c)


class PublicStatsTests(unittest.TestCase):
    """Source-level, because the failure is an ABSENT filter.

    A unit test would have to reproduce the whole query to notice that one of
    its counts forgot the exclusion — which is the same shape of bug as the
    review gate that was applied to one search path out of five.
    """

    def setUp(self):
        source = Path(inspect.getfile(public)).read_text()
        tree = ast.parse(source)
        self.fn = next(
            n for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef) and n.name == "get_public_stats"
        )
        self.body = ast.get_source_segment(source, self.fn) or ""

    def test_the_stats_endpoint_filters_on_the_flag(self):
        self.assertIn("exclude_from_stats", self.body)

    def test_both_the_search_count_and_the_user_count_are_filtered(self):
        """Two separate numbers, two separate chances to forget."""
        self.assertIn("staff_ids", self.body,
                      "the search total must exclude staff usage_metrics rows")
        self.assertRegex(
            self.body,
            r"sql_count\(User\.id\)[\s\S]{0,200}exclude_from_stats",
            "the user count must exclude staff accounts",
        )

    def test_it_does_not_key_off_is_moderator(self):
        """Checked on the AST, not the text — the comment says the word."""
        attributes = {
            n.attr for n in ast.walk(self.fn) if isinstance(n, ast.Attribute)
        }
        self.assertNotIn(
            "is_moderator", attributes,
            "public stats must key off exclude_from_stats — a real community "
            "moderator is still a user and still counts",
        )
        self.assertIn("exclude_from_stats", attributes)


if __name__ == "__main__":
    unittest.main()
