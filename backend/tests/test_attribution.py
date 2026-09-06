"""Acquisition attribution: the X-Attribution header -> users columns.

The header is parsed by attribution_from_request and only ever applied when a
users row is created, so these tests pin down the parser's tolerance (garbage
in must never break auth) and the write-once rule at creation.
"""

import unittest
from types import SimpleNamespace

from app.api.auth import ATTRIBUTION_KEYS, attribution_from_request


def _req(header: str | None):
    headers = {} if header is None else {"x-attribution": header}
    return SimpleNamespace(headers=headers)


class AttributionFromRequestTests(unittest.TestCase):
    def test_no_header(self):
        self.assertEqual(attribution_from_request(_req(None)), {})
        self.assertEqual(attribution_from_request(None), {})

    def test_keeps_only_known_keys(self):
        out = attribution_from_request(
            _req('{"utm_source":"instagram","utm_medium":"bio","fbclid":"x","email":"a@b"}')
        )
        self.assertEqual(out, {"utm_source": "instagram", "utm_medium": "bio"})

    def test_all_four(self):
        payload = '{"utm_source":"s","utm_medium":"m","utm_campaign":"c","referrer":"https://t.co/x"}'
        out = attribution_from_request(_req(payload))
        self.assertEqual(set(out), set(ATTRIBUTION_KEYS))

    def test_garbage_never_raises(self):
        for bad in ("not json", "[1,2]", '{"utm_source": 5}', '{"utm_source": ""}', "{"):
            self.assertEqual(attribution_from_request(_req(bad)), {}, bad)

    def test_truncates_long_values(self):
        out = attribution_from_request(_req('{"referrer":"' + "a" * 2000 + '"}'))
        self.assertEqual(len(out["referrer"]), 512)

    def test_oversized_header_dropped(self):
        out = attribution_from_request(_req('{"utm_source":"' + "a" * 5000 + '"}'))
        self.assertEqual(out, {})


class UserRowCreationTests(unittest.TestCase):
    """The columns exist on the model and accept the parsed dict as kwargs,
    which is exactly how get_current_user writes them."""

    def test_user_accepts_attribution_kwargs(self):
        from app.models.user import User

        attrs = attribution_from_request(
            _req('{"utm_source":"instagram","utm_campaign":"sept-launch","referrer":"https://l.instagram.com/"}')
        )
        user = User(email="a@b.c", supabase_id="x", **attrs)
        self.assertEqual(user.utm_source, "instagram")
        self.assertEqual(user.utm_campaign, "sept-launch")
        self.assertEqual(user.referrer, "https://l.instagram.com/")
        self.assertIsNone(user.utm_medium)


if __name__ == "__main__":
    unittest.main()
