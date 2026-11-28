"""user_events: closed vocabulary, sanitised properties, never raises."""

import unittest
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import events
from tests.dbfixture import memory_db, restore


class SanitizeTests(unittest.TestCase):
    def test_scalars_only(self):
        out = events.sanitize_properties(
            {"step": 2, "key": "casting", "ok": True, "nested": {"a": 1}, "list": [1], "none": None}
        )
        self.assertEqual(out, {"step": 2, "key": "casting", "ok": True})

    def test_truncates_strings_and_caps_keys(self):
        out = events.sanitize_properties({"s": "x" * 1000})
        self.assertEqual(len(out["s"]), events.MAX_STRING_LEN)
        many = {f"k{i}": i for i in range(50)}
        self.assertEqual(len(events.sanitize_properties(many)), events.MAX_PROPERTY_KEYS)

    def test_not_a_dict(self):
        self.assertEqual(events.sanitize_properties(None), {})
        self.assertEqual(events.sanitize_properties("x"), {})  # type: ignore[arg-type]


class RecordTests(unittest.TestCase):
    def setUp(self):
        # organizations first: users.organization_id points at it and the
        # fixture enforces foreign keys.
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="a@b.c", supabase_id="s1")
        self.db.add(self.user)
        self.db.commit()
        # Each call opens its own session; hand it ours.
        self.patcher = mock.patch.object(events, "SessionLocal", lambda: _NoClose(self.db))
        self.patcher.start()

    def tearDown(self):
        self.patcher.stop()
        restore(self.saved)

    def test_writes_known_event(self):
        ok = events.record_user_event(self.user.id, "signup_completed", {"provider": "google"})
        self.assertTrue(ok)
        row = self.db.query(UserEvent).one()
        self.assertEqual(row.event_name, "signup_completed")
        self.assertEqual(row.properties, {"provider": "google"})
        self.assertEqual(row.user_id, self.user.id)

    def test_turkish_ui_is_written_on_the_event(self):
        from app.services import library_language

        token = library_language.set_request_languages(library_language.TURKISH_LANGUAGES)
        try:
            events.record_user_event(self.user.id, "signup_completed", {"provider": "google"})
        finally:
            library_language._REQUEST_LANGUAGES.reset(token)
        row = self.db.query(UserEvent).one()
        self.assertEqual(row.properties, {"ui_language": "tr", "provider": "google"})

    def test_english_ui_writes_no_language(self):
        events.record_user_event(self.user.id, "signup_completed")
        self.assertEqual(self.db.query(UserEvent).one().properties, {})

    def test_unknown_name_is_dropped(self):
        self.assertFalse(events.record_user_event(self.user.id, "made_up"))
        self.assertEqual(self.db.query(UserEvent).count(), 0)

    def test_all_five_funnel_events_are_known(self):
        for name in (
            "signup_completed",
            "onboarding_step_viewed",
            "onboarding_completed",
            "search_box_focused",
            "first_search_submitted",
        ):
            self.assertIn(name, events.EVENT_NAMES, name)

    def test_client_cannot_send_server_events(self):
        self.assertNotIn("signup_completed", events.CLIENT_EVENT_NAMES)
        self.assertNotIn("first_search_submitted", events.CLIENT_EVENT_NAMES)

    def test_visit_once_a_day(self):
        self.assertFalse(events.visit_recorded_today(self.user.id))
        events.record_user_event(self.user.id, "visit_started", {"touch": "day3"})
        self.assertTrue(events.visit_recorded_today(self.user.id))

    def test_visit_from_yesterday_does_not_count(self):
        from datetime import datetime, timedelta, timezone

        self.db.add(UserEvent(user_id=self.user.id, event_name="visit_started", properties={},
                              created_at=datetime.now(timezone.utc) - timedelta(days=1, hours=1)))
        self.db.commit()
        self.assertFalse(events.visit_recorded_today(self.user.id))

    def test_tracking_events_are_client_events(self):
        for name in ("visit_started", "monologue_read_to_end", "app_paywall_shown",
                     "app_purchase_started", "app_purchase_completed", "app_purchase_cancelled"):
            self.assertIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_script_upload_funnel_events_are_client_events(self):
        for name in ("script_upload_opened", "script_upload_started",
                     "script_upload_failed", "script_upload_limit_hit"):
            self.assertIn(name, events.CLIENT_EVENT_NAMES, name)

    def test_never_raises(self):
        with mock.patch.object(events, "SessionLocal", side_effect=RuntimeError("db down")):
            self.assertFalse(events.record_user_event(self.user.id, "signup_completed"))


class _NoClose:
    """A session wrapper whose close() is a no-op, so the test can read it back."""

    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


if __name__ == "__main__":
    unittest.main()
