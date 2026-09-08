"""Every product event says what machine it came from.

Rehearsal sessions started carrying platform and browser on 2026-09-07
(ae5c2cc1), which is what makes "does speech die on iOS" answerable at last.
It answers it slowly: scene rehearsals run at about two a week, so twenty
sessions is a fortnight away.

The monologue path is where the volume is. Of the 116 actors who rehearsed
anything in the last 30 days, 105 did it there. Putting the same two fields on
product events fills the same table in days instead of weeks, and it costs one
change rather than one per flow, because every client event arrives at
POST /api/events with a User-Agent on it.

It answers a second open question for free. Onboarding completion fell from 97%
to 74% after 2026-08-19 and nobody knows whether that landed evenly across
devices; onboarding_step_viewed now carries the device, so the next read can
say.

The device is merged in before the caller's own properties, so a client that
sends a full payload cannot push it out under the twelve-key cap.
"""

import unittest
from unittest.mock import patch

IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)
DESKTOP = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class _Req:
    def __init__(self, ua):
        self.headers = {"user-agent": ua} if ua else {}


class _User:
    id = 7


class AClientEventCarriesTheDevice(unittest.TestCase):
    def _post(self, name="memorized_toggled", props=None, ua=IPHONE):
        from app.api.events import EventIn, post_event

        with patch("app.api.events.record_user_event") as rec:
            post_event(body=EventIn(event_name=name, properties=props),
                       http_request=_Req(ua), current_user=_User())
        return rec

    def test_platform_and_browser_are_added(self):
        rec = self._post()
        props = rec.call_args[0][2]
        self.assertEqual(props["client_platform"], "ios")
        self.assertEqual(props["client_browser"], "safari")

    def test_the_callers_own_properties_survive(self):
        rec = self._post(props={"monologue_id": 42, "memorized": True})
        props = rec.call_args[0][2]
        self.assertEqual(props["monologue_id"], 42)
        self.assertIs(props["memorized"], True)

    def test_a_desktop_is_told_apart(self):
        props = self._post(ua=DESKTOP).call_args[0][2]
        self.assertEqual(props["client_platform"], "desktop")
        self.assertEqual(props["client_browser"], "chrome")

    def test_no_user_agent_adds_nothing_rather_than_guessing(self):
        props = self._post(ua=None).call_args[0][2]
        self.assertNotIn("client_platform", props)
        self.assertNotIn("client_browser", props)

    def test_an_unknown_name_is_still_a_no_op(self):
        from app.api.events import EventIn, post_event

        with patch("app.api.events.record_user_event") as rec:
            post_event(body=EventIn(event_name="not_a_real_event"),
                       http_request=_Req(IPHONE), current_user=_User())
        rec.assert_not_called()

    def test_the_device_is_not_squeezed_out_by_a_full_payload(self):
        """sanitize_properties keeps twelve keys. The device goes in first so a
        caller with a lot to say cannot cost us the one field this is for."""
        from app.services.events import sanitize_properties

        props = self._post(props={f"k{i}": i for i in range(14)}).call_args[0][2]
        kept = sanitize_properties(props)
        self.assertEqual(kept.get("client_platform"), "ios")


class TheMonologueStartCarriesItToo(unittest.TestCase):
    """Server-side, where the paywall gate has already been cleared."""

    def _start(self, ua=IPHONE):
        from app.api.monologue_work import StartSessionRequest, start_session

        with patch("app.api.monologue_work.record_user_event") as rec:
            result = start_session(
                request=StartSessionRequest(monologue_id=42),
                http_request=_Req(ua),
                current_user=_User(),
                _gate=True,
            )
        return result, rec

    def test_it_still_answers_ok(self):
        result, _ = self._start()
        self.assertEqual(result, {"ok": True})

    def test_the_device_is_on_the_start(self):
        _, rec = self._start()
        props = rec.call_args[0][2]
        self.assertEqual(props["client_platform"], "ios")
        self.assertEqual(props["client_browser"], "safari")
        self.assertEqual(props["monologue_id"], 42)

    def test_instrumentation_still_never_fails_the_request(self):
        from app.api.monologue_work import StartSessionRequest, start_session

        with patch("app.api.monologue_work.record_user_event", side_effect=RuntimeError("db gone")):
            result = start_session(
                request=StartSessionRequest(monologue_id=1),
                http_request=_Req(IPHONE),
                current_user=_User(),
                _gate=True,
            )
        self.assertEqual(result, {"ok": True})


if __name__ == "__main__":
    unittest.main()
