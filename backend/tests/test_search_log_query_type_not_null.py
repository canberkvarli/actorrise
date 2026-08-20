"""query_type must never be NULL again.

The column landed 2026-08-19 and classified 44 of 1,170 rows, which is not an
analytics column, it is a week of traffic. scripts/backfill_search_query_type.py
fills the history; these tests pin the two things that keep it filled: the
column itself refuses NULL, and the classifier always has an answer to give.
"""

import unittest

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from app.models.search_log import SearchLog
from app.services.search.query_type import QUERY_TYPES, classify_query


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(type_, compiler, **kw):
    """search_logs carries JSONB columns (filters_used, result_ids, content_gap)
    that SQLite cannot render. They are irrelevant to what these tests assert,
    so map them to JSON for the in-memory table. Postgres is untouched."""
    return "JSON"


class QueryTypeNotNullTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        # The model uses Postgres now() as a server default; SQLite has none.
        @event.listens_for(self.engine, "connect")
        def _register_now(dbapi_conn, _record):
            dbapi_conn.create_function("now", 0, lambda: "2026-01-01 00:00:00")

        SearchLog.__table__.create(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_column_is_not_nullable(self):
        col = inspect(self.engine).get_columns("search_logs")
        query_type = next(c for c in col if c["name"] == "query_type")
        self.assertFalse(query_type["nullable"])

    def test_insert_without_query_type_defaults_rather_than_nulls(self):
        # The failure mode this guards: a new logging site is added, the author
        # does not know about query_type, and the column quietly goes back to
        # being 4% populated. It lands as 'other' instead — visible in the
        # split, and the search still succeeds.
        row = SearchLog(query="hamlet", results_count=3)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        self.assertIsNotNone(row.query_type)
        self.assertEqual(row.query_type, "other")

    def test_explicit_null_also_falls_back_to_the_default(self):
        # Passing query_type=None explicitly does not write NULL either:
        # SQLAlchemy omits a None-valued column that has a server default, so
        # the row lands as 'other'. Stronger than raising — there is no way to
        # get a NULL into this column, including by trying.
        row = SearchLog(query="hamlet", results_count=0, query_type=None)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        self.assertEqual(row.query_type, "other")

    def test_no_null_query_type_survives_a_mixed_batch(self):
        self.db.add_all(
            [
                SearchLog(query="fleabag", results_count=6, query_type="title"),
                SearchLog(query="sad 2 min", results_count=4),
                SearchLog(query="???", results_count=0, query_type=None),
            ]
        )
        self.db.commit()
        types = [r.query_type for r in self.db.query(SearchLog).all()]
        self.assertNotIn(None, types)
        self.assertEqual(sorted(types), ["other", "other", "title"])


class ClassifierAlwaysAnswersTests(unittest.TestCase):
    """The other half of the guarantee: the classifier cannot hand back a NULL.

    It runs on the logging path of every search, so it is written never to
    raise. These pin that it also never returns None or an off-list value for
    the inputs that actually reach it.
    """

    JUNK = [
        "",
        "   ",
        "a",
        "?!?!",
        "x" * 500,
        "\n\t",
        "😀😀",
        "SELECT * FROM users",
    ]

    def test_junk_still_classifies(self):
        for q in self.JUNK:
            with self.subTest(q=q[:20]):
                got = classify_query(q)
                self.assertIn(got, QUERY_TYPES)

    def test_none_query_classifies(self):
        self.assertIn(classify_query(None), QUERY_TYPES)

    def test_backfill_call_shape_matches_the_live_one(self):
        # The backfill passes intended_play/intended_author recovered from
        # content_gap and omits parsed_constraints. That call shape must stay
        # valid or the backfill breaks silently on the next signature change.
        got = classify_query(
            "something from fleabag",
            intended_play="Fleabag",
            intended_author=None,
        )
        self.assertIn(got, QUERY_TYPES)
