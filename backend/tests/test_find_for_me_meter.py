"""Find for me is Plus after one free press a month (2026-11-12).

The meter is user_events rows named find_for_me_used in the current calendar
month (UTC). Only the button sends find=1; the dashboard and the For you
shelves read the same recommender and are never metered.
"""

import inspect
import unittest
from datetime import datetime, timedelta, timezone

import app.api.monologues as mono_api
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.events import EVENT_NAMES
from tests.dbfixture import memory_db, restore


class FindForMeMeterTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="actor@example.com", supabase_id="a")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_a_press_is_counted_this_month(self):
        self.assertEqual(mono_api.find_for_me_used_this_month(self.db, self.user.id), 0)
        mono_api.record_find_for_me(self.db, self.user.id)
        self.assertEqual(mono_api.find_for_me_used_this_month(self.db, self.user.id), 1)

    def test_last_month_does_not_count(self):
        now = datetime.now(timezone.utc)
        last_month = now.replace(day=1) - timedelta(days=2)
        self.db.add(UserEvent(user_id=self.user.id, event_name="find_for_me_used",
                              properties={}, created_at=last_month))
        self.db.commit()
        self.assertEqual(mono_api.find_for_me_used_this_month(self.db, self.user.id), 0)

    def test_other_events_do_not_count(self):
        self.db.add(UserEvent(user_id=self.user.id, event_name="first_search_submitted",
                              properties={}, created_at=datetime.now(timezone.utc)))
        self.db.commit()
        self.assertEqual(mono_api.find_for_me_used_this_month(self.db, self.user.id), 0)

    def test_one_free_press_a_month(self):
        self.assertEqual(mono_api.FREE_FIND_FOR_ME_PER_MONTH, 1)

    def test_the_event_name_is_in_the_closed_vocabulary(self):
        self.assertIn("find_for_me_used", EVENT_NAMES)

    def test_only_the_button_is_metered(self):
        params = inspect.signature(mono_api.get_recommendations).parameters
        self.assertIn("find", params)
        self.assertIs(params["find"].default.default, False)


if __name__ == "__main__":
    unittest.main()
