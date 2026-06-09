"""Tests for the global app_settings helpers backing admin toggles.

Covers the founder-offer-on-signup flag: default when unset, set/get round
trip, and single-row upsert.
"""

import unittest

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.models.app_setting import AppSetting
from app.services import app_settings


class FounderOfferSettingTests(unittest.TestCase):
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
        self.assertTrue(
            app_settings.get_bool(
                self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, default=True
            )
        )
        self.assertFalse(
            app_settings.get_bool(self.db, "missing_key", default=False)
        )

    def test_set_then_get_round_trip(self):
        app_settings.set_bool(self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, False)
        self.assertFalse(
            app_settings.get_bool(
                self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, default=True
            )
        )
        app_settings.set_bool(self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, True)
        self.assertTrue(
            app_settings.get_bool(
                self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, default=False
            )
        )

    def test_upsert_keeps_single_row(self):
        app_settings.set_bool(self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, True)
        app_settings.set_bool(self.db, app_settings.FOUNDER_OFFER_ON_SIGNUP, False)
        rows = (
            self.db.query(AppSetting)
            .filter(AppSetting.key == app_settings.FOUNDER_OFFER_ON_SIGNUP)
            .all()
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].value, "false")


if __name__ == "__main__":
    unittest.main()
