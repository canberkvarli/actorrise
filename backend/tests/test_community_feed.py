"""Green Room feed — privacy + intent-gating logic.

Covers the two pure functions that guard the feed's privacy contract:
  * sanitize_payload — the hard wall that keeps raw queries / PII out of payload.
  * build_search_payload — only intent-bearing searches earn a feed event, and
    raw query text is never carried through.
"""

import unittest

from app.services.community import (ALLOWED_PAYLOAD_KEYS, build_search_payload,
                                    sanitize_payload)


class SanitizePayloadTests(unittest.TestCase):
    def test_drops_non_whitelisted_keys(self):
        # A raw query smuggled in as `text` or `query` must never survive.
        out = sanitize_payload({"text": "sex scene", "query": "nude", "tone": "comedic"})
        self.assertEqual(out, {"tone": "comedic"})

    def test_drops_none_values(self):
        out = sanitize_payload({"tone": None, "gender": "female"})
        self.assertEqual(out, {"gender": "female"})

    def test_keeps_all_whitelisted(self):
        full = {k: "x" for k in ALLOWED_PAYLOAD_KEYS}
        self.assertEqual(sanitize_payload(full), full)

    def test_empty(self):
        self.assertEqual(sanitize_payload({}), {})


class BuildSearchPayloadTests(unittest.TestCase):
    def test_none_when_no_filters(self):
        self.assertIsNone(build_search_payload(None))
        self.assertIsNone(build_search_payload({}))

    def test_none_when_no_intent(self):
        # author/emotion/themes alone are not enough — need tone/gender/age_range.
        self.assertIsNone(build_search_payload({"author": "Chekhov"}))
        self.assertIsNone(build_search_payload({"emotion": "grief", "themes": ["loss"]}))

    def test_extracts_intent_fields(self):
        out = build_search_payload({"tone": "comedic", "gender": "female", "age_range": "30s"})
        self.assertEqual(out, {"tone": "comedic", "gender": "female", "age_range": "30s"})

    def test_never_carries_raw_query(self):
        # SearchLog.filters_used never has raw text, but prove the guard anyway:
        # even if a "query" key sneaks into filters, it is not carried through.
        out = build_search_payload({"tone": "dramatic", "query": "raw text here"})
        self.assertEqual(out, {"tone": "dramatic"})
        self.assertNotIn("query", out)

    def test_gender_only_is_enough(self):
        self.assertEqual(build_search_payload({"gender": "male"}), {"gender": "male"})


if __name__ == "__main__":
    unittest.main()


class FeedPrivacyTest(unittest.TestCase):
    """Signed out, the feed is always masked; students never appear in it."""

    def setUp(self):
        from datetime import datetime, timezone

        from app.models.actor import ActorProfile
        from app.models.community import CommunityEvent
        from app.models.user import User
        from tests.dbfixture import memory_db

        # payload's '{}'::jsonb default is Postgres-only DDL; stand it down here.
        self.payload_col = CommunityEvent.__table__.c.payload
        self.payload_default = self.payload_col.server_default
        self.payload_col.server_default = None
        from app.models.organization import Organization

        self.db, self.saved = memory_db([Organization, User, ActorProfile, CommunityEvent])
        now = datetime.now(timezone.utc)
        self.actor = User(email="a@gmail.com", supabase_id="a", name="Rosa Diaz", share_activity=True, account_type="actor")
        self.student = User(email="1@school.org", supabase_id="s", name="Kid Smith", share_activity=True, account_type="student")
        self.db.add_all([self.actor, self.student])
        self.db.commit()
        for u in (self.actor, self.student):
            self.db.add(CommunityEvent(user_id=u.id, event_type="joined", payload={}, created_at=now))
        self.db.commit()

    def tearDown(self):
        from tests.dbfixture import restore

        self.db.close()
        restore(self.saved)
        self.payload_col.server_default = self.payload_default

    def _names(self, viewer, anonymize=False):
        from app.api.community import get_feed

        return [e.name for e in get_feed(limit=60, anonymize=anonymize, db=self.db, viewer=viewer).events]

    def test_signed_out_is_masked_even_when_it_asks_not_to_be(self):
        names = self._names(None, anonymize=False)
        self.assertTrue(names)
        self.assertNotIn("Rosa", names)

    def test_signed_in_sees_first_names(self):
        self.assertIn("Rosa", self._names(self.actor))

    def test_students_never_appear(self):
        for viewer in (None, self.actor):
            self.assertFalse(any(n and n.startswith("K") for n in self._names(viewer)))
