"""Tests for the content-request upsert backing the "request this" affordance.

A weak or empty search must be able to file a request from the raw query alone
(no named play/author), and repeat requests for the same thing must bump a
counter rather than pile up duplicate rows — that counter is what ranks the
admin content roadmap.
"""

import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.api.admin.searches import (
    ContentRequestCreate,
    ContentRequestUpdate,
    create_content_request,
    delete_content_request,
    update_content_request,
)
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


class AdminContentRequestEditTests(unittest.TestCase):
    """The admin queue is hand-edited: raw search strings get retitled, junk
    rows get binned, and gaps spotted in the logs get filed by hand. Those paths
    all mutate the same uniquely-indexed (title, author) pair, so they're the
    ones that can lose or duplicate a row."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def _register_now(dbapi_conn, _record):
            dbapi_conn.create_function("now", 0, lambda: "2026-01-01 00:00:00")

        ContentRequest.__table__.create(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_edit_renames_and_clears_author(self):
        row = upsert_content_request(self.db, "deth of a salesmn", author="A Miler")
        result = update_content_request(
            row.id,
            ContentRequestUpdate(play_title="Death of a Salesman", author="", status="planned"),
            self.db,
            None,
        )
        self.assertEqual(result["request"]["play_title"], "Death of a Salesman")
        # An emptied field must become NULL, not "" — the unique index treats
        # the two as different keys, which would split one title into two rows.
        self.assertIsNone(result["request"]["author"])
        self.assertEqual(result["request"]["status"], "planned")

    def test_status_only_edit_leaves_the_rest_alone(self):
        row = upsert_content_request(self.db, "Heathers", character_name="Veronica")
        update_content_request(row.id, ContentRequestUpdate(status="added"), self.db, None)
        self.db.refresh(row)
        self.assertEqual(row.status, "added")
        self.assertEqual(row.play_title, "Heathers")
        self.assertEqual(row.character_name, "Veronica")

    def test_renaming_onto_an_existing_title_merges_instead_of_crashing(self):
        keeper = upsert_content_request(self.db, "Mean Girls")
        upsert_content_request(self.db, "Mean Girls")  # 2 requests on the keeper
        typo = upsert_content_request(self.db, "Mean girlz")

        result = update_content_request(
            typo.id, ContentRequestUpdate(play_title="Mean Girls"), self.db, None
        )

        self.assertEqual(result["merged_into"], keeper.id)
        self.assertEqual(self.db.query(ContentRequest).count(), 1)
        # Demand is summed, not lost, so ranking stays honest after a cleanup.
        self.assertEqual(result["request"]["request_count"], 3)

    def test_empty_title_is_rejected(self):
        row = upsert_content_request(self.db, "Pen 15")
        with self.assertRaises(HTTPException) as ctx:
            update_content_request(row.id, ContentRequestUpdate(play_title="   "), self.db, None)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_bad_status_is_rejected(self):
        row = upsert_content_request(self.db, "Pen 15")
        with self.assertRaises(HTTPException) as ctx:
            update_content_request(row.id, ContentRequestUpdate(status="maybe"), self.db, None)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_delete_removes_the_row(self):
        row = upsert_content_request(self.db, "fdghdr")  # keyboard mash, real example
        delete_content_request(row.id, self.db, None)
        self.assertEqual(self.db.query(ContentRequest).count(), 0)

        with self.assertRaises(HTTPException) as ctx:
            delete_content_request(row.id, self.db, None)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_tracking_a_query_dedupes_against_what_actors_already_asked_for(self):
        upsert_content_request(self.db, "better call saul")

        created = create_content_request(
            ContentRequestCreate(play_title="Better Call Saul", status="planned"), self.db, None
        )

        self.assertFalse(created["created"])
        self.assertEqual(self.db.query(ContentRequest).count(), 1)
        self.assertEqual(created["request"]["request_count"], 2)
        self.assertEqual(created["request"]["status"], "planned")

    def test_tracking_a_new_query_creates_it(self):
        created = create_content_request(
            ContentRequestCreate(play_title="Innie Mark"), self.db, None
        )
        self.assertTrue(created["created"])
        self.assertEqual(created["request"]["status"], "requested")


if __name__ == "__main__":
    unittest.main()
