"""The path most people are actually on was invisible.

Measured 2026-09-07 against prod. 854 users, 462 of them have run a search, 240
of the 242 who searched in the last 30 days opened a monologue. 17 rehearsed a
scene. That 7% is the number the activation cliff has always been quoted from,
and it only ever counted `rehearsal_sessions` — the two-person ScenePartner.

What a searcher actually does next is open a monologue and work it. That flow
writes nothing. `POST /api/monologue-work/start` meters the free-tier counter
and returns {"ok": true}; no row, no event, nowhere. So the product could not
tell whether anybody practised a monologue, ever, and the one metric being
steered by covered a minority path.

Two events fix it, in the vocabulary the funnel already lives in, so activation
is one SQL query over user_events and search_logs rather than a guess:

    monologue_work_started    server, at the metered start, where the fact is
                              certain and the paywall has already been cleared
    monologue_work_finished   client, at the point the run completes, which
                              already fires trackRehearsalCompleted to GA4 and
                              was therefore known and thrown away

Started is emitted only when the gate lets the actor through. A 403 is a
paywall, not a rehearsal, and counting it would inflate exactly the number this
exists to measure.
"""

import unittest
from unittest.mock import patch

from app.services.events import (
    CLIENT_EVENT_NAMES,
    EVENT_NAMES,
    SERVER_EVENT_NAMES,
)


class TheVocabularyKnowsThem(unittest.TestCase):
    def test_the_start_is_a_server_fact(self):
        self.assertIn("monologue_work_started", SERVER_EVENT_NAMES)

    def test_the_finish_is_a_client_fact(self):
        self.assertIn("monologue_work_finished", CLIENT_EVENT_NAMES)

    def test_the_browser_may_not_claim_a_start(self):
        """Only the server knows the gate was cleared."""
        self.assertNotIn("monologue_work_started", CLIENT_EVENT_NAMES)

    def test_both_are_in_the_closed_list(self):
        self.assertTrue({"monologue_work_started", "monologue_work_finished"} <= EVENT_NAMES)


class TheStartIsRecorded(unittest.TestCase):
    def _call(self, user_id=7, monologue_id=42):
        from app.api.monologue_work import StartSessionRequest, start_session

        class _User:
            id = user_id

        with patch("app.api.monologue_work.record_user_event") as rec:
            result = start_session(
                request=StartSessionRequest(monologue_id=monologue_id),
                current_user=_User(),
                _gate=True,
            )
        return result, rec

    def test_it_still_answers_ok(self):
        result, _ = self._call()
        self.assertEqual(result, {"ok": True})

    def test_it_writes_the_event(self):
        _, rec = self._call()
        rec.assert_called_once()
        args, _kw = rec.call_args
        self.assertEqual(args[0], 7)
        self.assertEqual(args[1], "monologue_work_started")

    def test_it_says_which_piece(self):
        _, rec = self._call(monologue_id=99)
        args, _kw = rec.call_args
        self.assertEqual(args[2]["monologue_id"], 99)

    def test_instrumentation_never_takes_the_request_down(self):
        """record_user_event swallows its own errors, but the call site must
        not be the thing that 500s a rehearsal either."""
        from app.api.monologue_work import StartSessionRequest, start_session

        class _User:
            id = 7

        with patch("app.api.monologue_work.record_user_event", side_effect=RuntimeError("db gone")):
            result = start_session(
                request=StartSessionRequest(monologue_id=1),
                current_user=_User(),
                _gate=True,
            )
        self.assertEqual(result, {"ok": True})


if __name__ == "__main__":
    unittest.main()
