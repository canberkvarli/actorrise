"""Hosting a Green Room is Plus on the server too, not only in the browser.

The room invite is the one host action the server sees (a room's id is made
in the browser). Free actors get the same 403 shape as the library paywall.
"""

import os
import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

from app.api import community


def _body():
    return community.RoomInviteRequest(email="friend@example.com", room_id="abc12345", script_id=7)


class GreenRoomHostGateTest(unittest.TestCase):
    def setUp(self):
        community._INVITE_HITS.clear()
        self.user = SimpleNamespace(id=42, name="Sam Actor", email="sam@example.com")

    def test_free_actor_cannot_send_a_room_invite(self):
        with mock.patch("app.services.rehearsal.access.has_whole_library", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                community.send_room_invite(_body(), current_user=self.user, db=object())
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail["error"], "greenroom_host_plus_required")
        self.assertEqual(ctx.exception.detail["upgrade_url"], "/pricing")
        # A refused invite does not spend the actor's rate limit.
        self.assertNotIn(42, community._INVITE_HITS)

    def test_plus_actor_gets_through_the_gate(self):
        with mock.patch("app.services.rehearsal.access.has_whole_library", return_value=True), \
                mock.patch.dict(os.environ, {"RESEND_API_KEY": ""}):
            out = community.send_room_invite(_body(), current_user=self.user, db=object())
        self.assertEqual(out, {"sent": False, "reason": "email_not_configured"})


if __name__ == "__main__":
    unittest.main()
