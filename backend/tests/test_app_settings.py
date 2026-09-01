"""Tests for the global app_settings helpers backing admin toggles.

The founder-offer-on-signup tests lived here until 2026-09-01. f1585d85 retired
the founder coupon and deleted app_settings.FOUNDER_OFFER_ON_SIGNUP, but left
these behind erroring on the missing attribute. The bool helpers they exercised
(get_bool/set_bool) are still covered below against a live key, so nothing goes
untested by their removal.
"""

import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.app_setting import AppSetting
from app.services import app_settings


class BoolSettingTests(unittest.TestCase):
    """get_bool/set_bool, against a key that is not tied to a retired feature."""

    KEY = app_settings.SAVED_PIECE_REMINDER_ENABLED

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        # The model uses Postgres `now()` as a server default; SQLite has no
        # such function, so register a stub before any rows are inserted.
        @event.listens_for(self.engine, "connect")
        def _register_now(dbapi_conn, _record):
            dbapi_conn.create_function("now", 0, lambda: "2026-01-01 00:00:00")

        AppSetting.__table__.create(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_default_when_unset(self):
        self.assertTrue(app_settings.get_bool(self.db, self.KEY, default=True))
        self.assertFalse(
            app_settings.get_bool(self.db, "missing_key", default=False)
        )

    def test_set_then_get_round_trip(self):
        app_settings.set_bool(self.db, self.KEY, False)
        self.assertFalse(app_settings.get_bool(self.db, self.KEY, default=True))
        app_settings.set_bool(self.db, self.KEY, True)
        self.assertTrue(app_settings.get_bool(self.db, self.KEY, default=False))

    def test_upsert_keeps_single_row(self):
        app_settings.set_bool(self.db, self.KEY, True)
        app_settings.set_bool(self.db, self.KEY, False)
        rows = (
            self.db.query(AppSetting)
            .filter(AppSetting.key == self.KEY)
            .all()
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].value, "false")


class FloatSettingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def _register_now(dbapi_conn, _record):
            dbapi_conn.create_function("now", 0, lambda: "2026-01-01 00:00:00")

        AppSetting.__table__.create(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_get_float_returns_default_when_missing(self):
        self.assertEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.30,
        )

    def test_get_float_roundtrips(self):
        app_settings.set_float(self.db, "search_relevance_floor", 0.34)
        self.assertAlmostEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.34,
        )

    def test_get_float_falls_back_on_garbage(self):
        app_settings.set_value(self.db, "search_relevance_floor", "not-a-number")
        self.assertEqual(
            app_settings.get_float(self.db, "search_relevance_floor", default=0.30),
            0.30,
        )


if __name__ == "__main__":
    unittest.main()
