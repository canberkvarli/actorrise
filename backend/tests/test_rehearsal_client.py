"""Every rehearsal that dies should say what it was running on.

68 sessions in 60 days: 17 completed, 28 abandoned, 23 timed out. Every one of
the 51 failures has a null failure_reason, and 45% of them always will —
`timed_out` is set server-side by a sweep, so the client that would have said
why is long gone. The standing explanation, that iOS Safari reports speech
recognition and then refuses to do it, has been an inference from a device
split since 2026-08-29 and has never been checked against a session that
actually died.

It cannot be checked, because a session records nothing about the machine it
ran on.

The User-Agent is on the request that starts the session, which is a request
that has to succeed for the session to exist at all. Reading it there costs
nothing, needs no client change, and cannot be skipped by a browser that
vanishes later — so it covers the timed-out 45% that no beacon will ever
reach.

Coarse on purpose: a platform and a browser family, the two axes the open
question is about. Not a fingerprint, and not a version string nobody will
ever group by.
"""

import unittest

from app.services.rehearsal_client import client_browser, client_platform

IPHONE_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
IPHONE_CHROME = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) CriOS/126.0.6478.65 Mobile/15E148 Safari/604.1"
)
IPHONE_INSTAGRAM = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.35.90"
)
ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.6478.71 Mobile Safari/537.36"
)
IPAD_SAFARI = (
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/604.1"
)
MAC_CHROME = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
MAC_SAFARI = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)
WINDOWS_EDGE = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0"
)


class WhichMachine(unittest.TestCase):
    def test_an_iphone_is_ios(self):
        self.assertEqual(client_platform(IPHONE_SAFARI), "ios")

    def test_an_ipad_is_ios_too(self):
        """Same speech engine, same refusal. Grouping them apart would split
        the one number the question is about."""
        self.assertEqual(client_platform(IPAD_SAFARI), "ios")

    def test_an_android_phone(self):
        self.assertEqual(client_platform(ANDROID_CHROME), "android")

    def test_a_mac_is_desktop(self):
        self.assertEqual(client_platform(MAC_CHROME), "desktop")

    def test_windows_is_desktop(self):
        self.assertEqual(client_platform(WINDOWS_EDGE), "desktop")

    def test_nothing_is_unknown_not_a_guess(self):
        self.assertIsNone(client_platform(None))
        self.assertIsNone(client_platform(""))


class WhichBrowser(unittest.TestCase):
    def test_safari_on_iphone(self):
        self.assertEqual(client_browser(IPHONE_SAFARI), "safari")

    def test_chrome_on_iphone_is_chrome(self):
        """CriOS is Chrome's shell over Apple's engine. It says Safari in the
        same string, so order of checks decides this one."""
        self.assertEqual(client_browser(IPHONE_CHROME), "chrome")

    def test_chrome_on_android(self):
        self.assertEqual(client_browser(ANDROID_CHROME), "chrome")

    def test_edge_is_not_chrome(self):
        self.assertEqual(client_browser(WINDOWS_EDGE), "edge")

    def test_desktop_safari(self):
        self.assertEqual(client_browser(MAC_SAFARI), "safari")

    def test_an_in_app_webview_is_named(self):
        """Instagram's webview is one of the two suspects for speech being
        refused, and it is invisible if it is filed as Safari."""
        self.assertEqual(client_browser(IPHONE_INSTAGRAM), "instagram")

    def test_nothing_is_unknown(self):
        self.assertIsNone(client_browser(None))
        self.assertIsNone(client_browser(""))


class ItNeverThrows(unittest.TestCase):
    """This runs inside the request that creates a session. It is diagnostics;
    it must never be the reason a rehearsal fails to start."""

    def test_junk_is_survivable(self):
        for junk in ("\x00\x01", "a" * 5000, "Mozilla/5.0 (", "🎭"):
            with self.subTest(junk=junk[:12]):
                client_platform(junk)
                client_browser(junk)

    def test_a_long_string_is_not_stored_whole(self):
        self.assertLessEqual(len(client_browser("Chrome/1 " + "x" * 4000) or ""), 32)


if __name__ == "__main__":
    unittest.main()
