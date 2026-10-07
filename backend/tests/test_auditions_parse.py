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
        self.assertEqual(d["material"], {"length_seconds": 60, "genre": "comedic", "era": "contemporary", "count": 1})

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
        with mock.patch.object(parse, "_is_paid", lambda db, uid: False):
            self._use(4, NOW - timedelta(days=1))
            self._use(9, datetime(2026, 9, 28, tzinfo=timezone.utc))  # last month, does not count
            q = parse.quota(self.db, self.user.id, NOW)
            self.assertEqual((q["used"], q["limit"], q["remaining"]), (4, 5, 1))
            self._use(1, NOW)
            self.assertEqual(parse.quota(self.db, self.user.id, NOW)["remaining"], 0)

    def test_paid_is_unlimited(self):
        with mock.patch.object(parse, "_is_paid", lambda db, uid: True):
            self._use(40, NOW)
            q = parse.quota(self.db, self.user.id, NOW)
            self.assertIsNone(q["limit"])
            self.assertIsNone(q["remaining"])


if __name__ == "__main__":
    unittest.main()
