"""Tests for the content-request upsert backing the "request this" affordance.

A weak or empty search must be able to file a request from the raw query alone
(no named play/author), and repeat requests for the same thing must bump a
counter rather than pile up duplicate rows — that counter is what ranks the
admin content roadmap.
"""

import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.content_request import ContentRequest, upsert_content_request


class UpsertContentRequestTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        # The model uses Postgres now() as a server default; SQLite has none.
        @event.listens_for(self.engine, "connect")
        def _register_now(dbapi_conn, _record):
            dbapi_conn.create_function("now", 0, lambda: "2026-01-01 00:00:00")

        ContentRequest.__table__.create(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_raw_query_request_creates_row(self):
        row = upsert_content_request(self.db, "sarcastic two hander")
        self.assertIsNotNone(row.id)
        self.assertEqual(row.play_title, "sarcastic two hander")
        self.assertIsNone(row.author)
        self.assertEqual(row.request_count, 1)
        self.assertEqual(self.db.query(ContentRequest).count(), 1)

    def test_repeat_request_increments_count_not_rows(self):
        first = upsert_content_request(self.db, "sarcastic two hander")
        first_stamp = first.last_requested_at
        again = upsert_content_request(self.db, "  Sarcastic Two Hander  ")  # case/space variant

        self.assertEqual(again.id, first.id)
        self.assertEqual(again.request_count, 2)
        self.assertEqual(self.db.query(ContentRequest).count(), 1)
        # last_requested_at is refreshed on the repeat.
        self.assertIsNotNone(again.last_requested_at)

    def test_named_title_and_raw_query_are_distinct_rows(self):
        upsert_content_request(self.db, "The Seagull", author="Chekhov")
        upsert_content_request(self.db, "sarcastic two hander")
        self.assertEqual(self.db.query(ContentRequest).count(), 2)


if __name__ == "__main__":
    unittest.main()
