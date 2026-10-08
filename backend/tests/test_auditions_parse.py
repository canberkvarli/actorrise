"""Breakdown parsing: the model is never called here. Recorded model outputs go
through normalize_draft, and parse_notice gets a fake llm_call."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.auditions import parse
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)  # a Wednesday

BACKSTAGE = {
    "project": {"value": "Arden Theatre 2027 Season", "confidence": "high"},
    "role": {"value": None, "confidence": "high"},
    "kind": {"value": "in_person", "confidence": "high"},
    "starts_at": {"value": "2026-10-09T10:40:00", "confidence": "high"},
    "due_at": {"value": None, "confidence": "high"},
    "location": {"value": "Ripley Grier, Studio 16C", "confidence": "high"},
    "casting": {"value": "Telsey + Co", "confidence": "low"},
    "material_raw": {"value": "1 min contemporary comedic", "confidence": "high"},
    "material": {"length_seconds": 60, "genre": "comedic", "era": "contemporary", "count": 1},
    "bring": {"value": "headshot and resume", "confidence": "high"},
}


class NormalizeTests(unittest.TestCase):
    def test_local_time_becomes_utc_and_confidence_survives(self):
        d = parse.normalize_draft(BACKSTAGE, NOW, "America/New_York")
        self.assertEqual(d["starts_at"]["value"], "2026-10-09T14:40:00+00:00")  # EDT is UTC-4
        self.assertEqual(d["starts_at"]["confidence"], "high")
        self.assertEqual(d["casting"]["confidence"], "low")
        self.assertEqual(d["material"], {"length_seconds": 60, "genre": "comedic", "era": "contemporary", "count": 1, "own_choice": None})

    def test_past_and_far_future_dates_drop_to_low(self):
        raw = dict(BACKSTAGE, starts_at={"value": "2026-09-01T10:00:00", "confidence": "high"})
        self.assertEqual(parse.normalize_draft(raw, NOW, "UTC")["starts_at"]["confidence"], "low")
        raw = dict(BACKSTAGE, starts_at={"value": "2029-01-01T10:00:00", "confidence": "high"})
        self.assertEqual(parse.normalize_draft(raw, NOW, "UTC")["starts_at"]["confidence"], "low")

    def test_garbage_is_survivable(self):
        d = parse.normalize_draft({"project": "not a dict", "kind": {"value": "hologram"},
                                   "starts_at": {"value": "next thursday-ish"}}, NOW, "Not/AZone")
        self.assertEqual(d["project"], {"value": None, "confidence": "low"})
        self.assertEqual(d["kind"], {"value": "in_person", "confidence": "low"})
        self.assertEqual(d["starts_at"], {"value": None, "confidence": "low"})

    def test_long_strings_are_cut(self):
        raw = dict(BACKSTAGE, project={"value": "x" * 900, "confidence": "high"})
        self.assertEqual(len(parse.normalize_draft(raw, NOW, "UTC")["project"]["value"]), 200)


class ReviewFixTests(unittest.TestCase):
    def test_date_only_deadline_is_end_of_day_local(self):
        raw = dict(BACKSTAGE, due_at={"value": "2026-10-12", "confidence": "high"})
        d = parse.normalize_draft(raw, NOW, "America/New_York")
        self.assertEqual(d["due_at"]["value"], "2026-10-13T03:59:00+00:00")  # 23:59 EDT
        raw = dict(BACKSTAGE, due_at={"value": "2026-10-12T09:00:00", "confidence": "high"})
        self.assertEqual(parse.normalize_draft(raw, NOW, "UTC")["due_at"]["value"], "2026-10-12T09:00:00+00:00")

    def test_material_is_lowercased_and_bools_rejected(self):
        raw = dict(BACKSTAGE, material={"length_seconds": True, "genre": "Comedic", "era": " CLASSICAL ", "count": False})
        self.assertEqual(
            parse.normalize_draft(raw, NOW, "UTC")["material"],
            {"length_seconds": None, "genre": "comedic", "era": "classical", "count": None, "own_choice": None},
        )

    def test_own_choice_is_a_bool_or_nothing(self):
        for given, want in ((False, False), (True, True), ("yes", None)):
            raw = dict(BACKSTAGE, material={"own_choice": given})
            self.assertIs(parse.normalize_draft(raw, NOW, "UTC")["material"]["own_choice"], want)

    def test_default_call_bounds_the_client_not_a_thread(self):
        seen = {}

        class Fake:
            def invoke(self, prompt):
                raise TimeoutError("slow")

        def fake_get_llm(**kw):
            seen.update(kw)
            return Fake()

        with mock.patch("app.services.ai.langchain.config.get_llm", fake_get_llm):
            out = parse.parse_notice("CALLBACK", NOW, "UTC")
        self.assertEqual(seen["timeout"], parse.TIMEOUT_S)
        self.assertEqual(seen["max_retries"], 0)
        self.assertFalse(out["ok"])
        self.assertEqual(out["draft"]["notes"]["value"], "CALLBACK")


class ParseNoticeTests(unittest.TestCase):
    def test_good_call(self):
        out = parse.parse_notice("notice", NOW, "UTC", llm_call=lambda prompt: json.dumps(BACKSTAGE))
        self.assertTrue(out["ok"])
        self.assertEqual(out["draft"]["project"]["value"], "Arden Theatre 2027 Season")

    def test_retries_once_then_gives_the_text_back(self):
        calls = []

        def bad(prompt):
            calls.append(prompt)
            return "not json"

        out = parse.parse_notice("CALLBACK Thursday for LAURA", NOW, "UTC", llm_call=bad)
        self.assertEqual(len(calls), 2)
        self.assertFalse(out["ok"])
        self.assertEqual(out["draft"]["notes"]["value"], "CALLBACK Thursday for LAURA")

    def test_prompt_carries_date_and_zone(self):
        seen = []
        parse.parse_notice("x", NOW, "Europe/London", llm_call=lambda p: seen.append(p) or json.dumps(BACKSTAGE))
        self.assertIn("Wednesday 2026-10-07", seen[0])
        self.assertIn("Europe/London", seen[0])

    def test_text_is_capped(self):
        seen = []
        parse.parse_notice("y" * 50_000, NOW, "UTC", llm_call=lambda p: seen.append(p) or json.dumps(BACKSTAGE))
        self.assertLess(len(seen[0]), parse.MAX_TEXT + 3000)


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserEvent])
        self.user = User(email="q@x.com", supabase_id="q")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def _use(self, n, when):
        for _ in range(n):
            self.db.add(UserEvent(user_id=self.user.id, event_name="audition_parse_requested", properties={}, created_at=when))
        self.db.commit()

    def test_free_gets_five_a_calendar_month(self):
        with mock.patch.object(parse, "_tier", lambda db, uid: "free"):
            self._use(4, NOW - timedelta(days=1))
            self._use(9, datetime(2026, 9, 28, tzinfo=timezone.utc))  # last month, does not count
            q = parse.quota(self.db, self.user.id, NOW)
            self.assertEqual((q["used"], q["limit"], q["remaining"]), (4, 5, 1))
            self._use(1, NOW)
            self.assertEqual(parse.quota(self.db, self.user.id, NOW)["remaining"], 0)

    def test_month_start_is_utc(self):
        # 23:30 on Sept 30 in New York is already Oct 1 in UTC
        ny = timezone(timedelta(hours=-4))
        with mock.patch.object(parse, "_tier", lambda db, uid: "free"):
            self._use(2, datetime(2026, 10, 1, 1, tzinfo=timezone.utc))
            q = parse.quota(self.db, self.user.id, datetime(2026, 9, 30, 21, 30, tzinfo=ny))
            self.assertEqual(q["used"], 2)

    def test_plus_gets_thirty_and_pro_a_hundred(self):
        self._use(31, NOW)
        for tier, limit, remaining in (("plus", 30, 0), ("pro", 100, 69)):
            with mock.patch.object(parse, "_tier", lambda db, uid, t=tier: t):
                q = parse.quota(self.db, self.user.id, NOW)
                self.assertEqual((q["tier"], q["limit"], q["remaining"]), (tier, limit, remaining))


class TierTests(unittest.TestCase):
    def setUp(self):
        from app.models.billing import PricingTier, UserSubscription

        self.db, self.saved = memory_db([Organization, User, PricingTier, UserSubscription])
        self.free = PricingTier(name="free", display_name="Free", monthly_price_cents=0, features={})
        self.plus = PricingTier(name="plus", display_name="Plus", monthly_price_cents=1200, features={})
        self.pro = PricingTier(name="pro", display_name="Pro", monthly_price_cents=2400, features={})
        self.solo = PricingTier(name="solo", display_name="Solo", monthly_price_cents=700, features={})
        self.user = User(email="p@x.com", supabase_id="p")
        self.db.add_all([self.free, self.plus, self.pro, self.solo, self.user])
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def _sub(self, tier, **kw):
        from app.models.billing import UserSubscription

        self.db.add(UserSubscription(user_id=self.user.id, tier_id=tier.id, **kw))
        self.db.commit()

    def test_no_row(self):
        self.assertEqual(parse._tier(self.db, self.user.id), "free")

    def test_free_tier(self):
        self._sub(self.free, status="active")
        self.assertEqual(parse._tier(self.db, self.user.id), "free")

    def test_expired_comp(self):
        self._sub(self.plus, status="active", trial_end=datetime.now(timezone.utc) - timedelta(days=1))
        self.assertEqual(parse._tier(self.db, self.user.id), "free")

    def test_active_paid(self):
        self._sub(self.plus, status="active", stripe_subscription_id="sub_1")
        self.assertEqual(parse._tier(self.db, self.user.id), "plus")

    def test_trialing_paid(self):
        self._sub(self.plus, status="trialing", stripe_subscription_id="sub_2")
        self.assertEqual(parse._tier(self.db, self.user.id), "plus")

    def test_pro(self):
        self._sub(self.pro, status="active", stripe_subscription_id="sub_3")
        self.assertEqual(parse._tier(self.db, self.user.id), "pro")

    def test_legacy_solo_reads_as_plus(self):
        self._sub(self.solo, status="active", stripe_subscription_id="sub_4")
        self.assertEqual(parse._tier(self.db, self.user.id), "plus")

    def test_monologues_app_tier_gets_the_free_cap(self):
        from app.models.billing import PricingTier

        mono = PricingTier(name="monologues", display_name="Monologues", monthly_price_cents=500, features={})
        self.db.add(mono)
        self.db.commit()
        self._sub(mono, status="active", stripe_subscription_id="sub_5")
        self.assertEqual(parse._tier(self.db, self.user.id), "free")


if __name__ == "__main__":
    unittest.main()
