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
