"""The email a comped user gets when Canberk switches their account on.

Until now this did not exist. `upgrade_notification` sounds like it but is
hardcoded `to="canberk@actorrise.com"` — it is the founder's "someone paid"
alert. So on 2026-09-05, 31 accounts were holding a comp and not one of them
had ever been told, which is most of why comped educators sign in once and
never come back.

Three audiences, three different promises, one template. An educator is told
her class is covered; a student is told their teacher can cover the rest of
the class; an actor is told neither, because neither is true for them.
"""

import unittest

from app.api.admin.users import AdminGrantRequest
from app.services.email.templates import EmailTemplates


class MembershipGrantedTemplateTests(unittest.TestCase):
    def setUp(self):
        self.t = EmailTemplates()

    def _html(self, **kw):
        kw.setdefault("user_name", "Stephanie")
        kw.setdefault("tier_display_name", "Plus")
        kw.setdefault("duration_label", "1 month")
        return self.t.render_membership_granted(**kw)

    def test_says_what_they_got_and_for_how_long(self):
        html = self._html()
        self.assertIn("Plus", html)
        self.assertIn("1 month", html)
        self.assertIn("Stephanie", html)

    def test_educator_is_told_their_class_is_covered(self):
        html = self._html(account_type="educator")
        self.assertIn("students", html.lower())
        self.assertIn("canberk@actorrise.com", html)

    def test_student_is_not_promised_they_can_comp_a_class(self):
        # Only the teacher can bring the class. Telling a student to send me
        # a roster invites exactly the direct-to-student path that failed.
        html = self._html(account_type="student")
        self.assertIn("teacher", html.lower())
        self.assertNotIn("your students", html.lower())

    def test_actor_gets_neither_pitch(self):
        html = self._html(account_type=None)
        self.assertNotIn("your students", html.lower())
        self.assertNotIn("your teacher", html.lower())

    def test_no_card_reassurance_is_present(self):
        # The single most common reply to a comp is "wait, am I being charged".
        self.assertIn("card", self._html().lower())

    def test_permanent_grant_has_no_expiry_sentence(self):
        html = self._html(duration_label=None)
        self.assertNotIn("None", html)

    def test_plain_text_alternative_exists_and_has_no_html(self):
        txt = self.t.render_membership_granted_plain(
            user_name="Stephanie", tier_display_name="Plus",
            duration_label="1 month", account_type="educator",
        )
        self.assertNotIn("<", txt)
        self.assertIn("Plus", txt)

    def test_no_em_dashes_anywhere(self):
        # House rule: dashes read as AI-written and this is a letter from a person.
        for kw in ({}, {"account_type": "educator"}, {"account_type": "student"}):
            html = self._html(**kw)
            for bad in ("—", "–", "&mdash;", "&ndash;"):
                self.assertNotIn(bad, html, f"{bad!r} found in {kw}")


class GrantNotifyFlagTests(unittest.TestCase):
    def test_notify_defaults_to_true(self):
        # Silent-by-default is what produced 31 people who were never told.
        req = AdminGrantRequest(tier_id=4, duration_days=30, note="Educator comp")
        self.assertTrue(req.notify)

    def test_notify_can_be_turned_off(self):
        req = AdminGrantRequest(tier_id=4, duration_days=30, note="Fixing a mistake", notify=False)
        self.assertFalse(req.notify)


if __name__ == "__main__":
    unittest.main()
