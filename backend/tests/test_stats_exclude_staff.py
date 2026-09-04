"""Staff use must not show up in user-facing numbers.

`/api/public/stats` feeds the landing page: "N monologues found by actors" and
"N actors are using ActorRise". Both counted every account, so the founder
testing his own search all day was indistinguishable from demand — 1,144 of
3,853 searches, 30% of the headline figure, came from three staff accounts.

The flag is `exclude_from_stats`, deliberately NOT `is_moderator`. Moderating is
a permission a real community member could be given, and when that happens they
are still a user and still count. Conflating the two would quietly delete a real
person from the numbers the day they were made a moderator.

The admin dashboards apply the same rule, and that reverses what this file
originally said. The old reasoning was that on /admin the founder's own activity
is real activity. In practice it is test activity: a day spent checking that
rehearsal works is a day of sessions that never belonged in a completion funnel,
and reading the dashboard afterwards means mentally subtracting a number nobody
can see. /admin/stats and /admin/searches were fixed first; /admin/sessions kept
counting it until 2026-09-04.
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


class AdminSearchAnalyticsTests(unittest.TestCase):
    """The admin Search page must show real actors, not the founder testing.

    He was the busiest "actor" in the library at 49 searches, more than twice
    the next person, so he topped every table and moved every average.
    """

    def setUp(self):
        from app.api.admin import searches
        self.source = Path(inspect.getfile(searches)).read_text()
        self.mod = searches

    def test_every_aggregate_excludes_staff(self):
        """Summary, retry, per-user and the raw feed — four separate chances."""
        self.assertGreaterEqual(
            self.source.count("_NOT_STAFF"), 4,
            "an aggregate is missing the staff filter",
        )
        self.assertIn("_exclude_staff", self.source)

    def test_the_rule_is_shared_with_admin_stats(self):
        """One definition. Two would drift, which is the bug this repo keeps
        producing — see the search review gate applied to 1 path of 5."""
        self.assertIn("test_user_filter", self.source)

    def test_bad_searches_is_a_union_not_a_sum(self):
        """zero + weak double-counts the rows that are both.

        abhishekyadav07399@gmail.com ran 5 searches: 1 returned nothing and 5
        were weak, so the sum was 6 and the UI displayed "120.0% went badly".
        """
        self.assertIn(
            "results_count = 0 OR weak_match IS TRUE", self.source,
            "the per-user bad count must be one OR-filter, not two counts added",
        )

    def test_the_percentage_cannot_exceed_one_hundred(self):
        zero, weak, both, searches = 1, 5, 1, 5
        union = zero + weak - both
        self.assertLessEqual(union / searches, 1.0)
        self.assertGreater((zero + weak) / searches, 1.0)  # the old arithmetic


class AdminSessionAnalyticsTests(unittest.TestCase):
    """The rehearsal dashboard had no staff filter at all.

    Every session started to check that ScenePartner still worked counted as an
    actor rehearsing: in the funnel, in the drop-off buckets, in per-scene, and
    at the top of the per-user table. A test run abandoned at 0% because the
    point was to see the first line render is indistinguishable, once it is a
    row, from an actor who gave up.
    """

    def setUp(self):
        from app.api.admin import sessions
        self.source = Path(inspect.getfile(sessions)).read_text()

    def test_the_rule_is_shared_not_re_derived(self):
        """One definition across /admin/stats, /searches and /sessions. Two
        copies drift, which is the failure this file keeps documenting."""
        self.assertIn("from app.services.admin_filters import test_user_filter", self.source)

    def test_every_aggregate_applies_it(self):
        """Four separate chances to forget: the feed, the page-1 summary, the
        top-scenes list, and the analytics window that all of /sessions/analytics
        is built on."""
        self.assertGreaterEqual(
            self.source.count("not_staff"), 5,  # 1 def + 4 uses
            "an aggregate on /admin/sessions is missing the staff filter",
        )

    def test_the_analytics_window_carries_it(self):
        """`window` is spread into the funnel, drop-off, per-scene and per-user
        queries, so putting the filter there covers all four at once — and means
        a new query that uses `window` is filtered by default."""
        window = self.source.split("window = (", 1)[1].split("\n    )", 1)[0]
        self.assertIn("_not_staff(db)", window)

    def test_an_explicit_search_can_still_find_staff(self):
        """A filter you cannot see past is a filter you cannot debug past, so
        typing an address or scene title into `q` overrides it. The summary
        numbers below it never do."""
        self.assertIn("if not q:", self.source)

    def test_anonymous_sessions_still_count(self):
        """No user_id means nobody claims it, not that it isn't real use."""
        self.assertIn("RehearsalSession.user_id.is_(None)", self.source)


if __name__ == "__main__":
    unittest.main()
