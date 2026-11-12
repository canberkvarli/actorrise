"""The Ghost Light dashboard values each subscriber at what they pay.

Version 1.1 moved new buyers to new products at $9.99 / $59.99; the first
subscribers stay on the old products at $4.99 / $29.99. The dashboard used the
old list prices for everyone (2026-11-12).
"""

import unittest
from datetime import datetime, timedelta, timezone

from app.api.admin import ghostlight as gl
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from tests.dbfixture import memory_db, restore


class ListPriceTests(unittest.TestCase):
    def test_new_products(self):
        self.assertEqual(gl._list_price("com.actorrise.ghostlight.premium.yearly.v2", None), (59.99, True))
        self.assertEqual(gl._list_price("com.actorrise.ghostlight.premium.monthly.v2", None), (9.99, False))

    def test_legacy_products(self):
        self.assertEqual(gl._list_price("ghostlight_monologues_annual", None), (29.99, True))
        self.assertEqual(gl._list_price("ghostlight_monologues_monthly", None), (4.99, False))

    def test_no_product_known_is_an_early_subscriber(self):
        self.assertEqual(gl._list_price(None, "annual"), (29.99, True))
        self.assertEqual(gl._list_price(None, "monthly"), (4.99, False))

    def test_monthly_value(self):
        self.assertEqual(gl._monthly_value((59.99, True, "x.yearly.v2"), "annual"), 5.0)
        self.assertEqual(gl._monthly_value((9.99, False, "x.monthly.v2"), "monthly"), 9.99)
        self.assertEqual(gl._monthly_value(None, "annual"), 2.5)


class PaidPriceTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.users = [User(email=f"u{i}@example.com", supabase_id=f"u{i}") for i in range(4)]
        self.db.add_all(self.users)
        self.db.commit()
        self.t0 = datetime.now(timezone.utc) - timedelta(days=10)

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _ev(self, user, product, price, days=0, env="PRODUCTION", type_="RENEWAL"):
        self.db.add(UserEvent(
            user_id=user.id, event_name="app_subscription_event",
            properties={"product_id": product, "price": price, "environment": env, "type": type_},
            created_at=self.t0 + timedelta(days=days),
        ))
        self.db.commit()

    def test_the_reported_usd_price_wins(self):
        u = self.users[0]
        self._ev(u, "ghostlight_monologues_annual", 40.10)  # a UK annual, in USD
        self.assertEqual(gl._paid_prices(self.db, [u.id])[u.id], (40.10, True, "ghostlight_monologues_annual"))

    def test_a_zero_priced_newest_event_falls_back_to_the_last_real_price(self):
        u = self.users[1]
        self._ev(u, "com.actorrise.ghostlight.premium.yearly.v2", 59.99, days=0, type_="INITIAL_PURCHASE")
        self._ev(u, "com.actorrise.ghostlight.premium.yearly.v2", 0.0, days=3, type_="CANCELLATION")
        self.assertEqual(gl._paid_prices(self.db, [u.id])[u.id][0], 59.99)

    def test_only_a_product_known_uses_its_list_price(self):
        u = self.users[2]
        self._ev(u, "com.actorrise.ghostlight.premium.monthly.v2", 0.0, type_="CANCELLATION")
        self.assertEqual(gl._paid_prices(self.db, [u.id])[u.id], (9.99, False, "com.actorrise.ghostlight.premium.monthly.v2"))

    def test_sandbox_is_ignored(self):
        u = self.users[3]
        self._ev(u, "com.actorrise.ghostlight.premium.yearly.v2", 59.99, env="SANDBOX")
        self.assertNotIn(u.id, gl._paid_prices(self.db, [u.id]))


if __name__ == "__main__":
    unittest.main()
