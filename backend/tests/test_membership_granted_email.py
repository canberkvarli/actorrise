"""The email a comped user gets when Canberk switches their account on.

Until now this did not exist. `upgrade_notification` sounds like it but is
hardcoded `to="canberk@actorrise.com"` — it is the founder's "someone paid"
alert. So on 2026-09-05, 31 accounts were holding a comp and not one of them
had ever been told, which is most of why comped educators sign in once and
never come back.

Three audiences, three different promises, one template. An educator is told
her class is covered; a student is told their teacher can cover the rest of
the class; an actor is told neither, because neither is true for them.

The end of the comp is stated as a DATE, never a duration. Those 31 comps run
to at least five different end dates and nine never expire at all, so "free
for a month" would have been false for almost everyone, and false in a way the
reader can check.
"""

import unittest
from datetime import datetime, timezone

from app.api.admin.users import AdminGrantRequest, _expires_label
from app.services.email.templates import EmailTemplates


class ExpiresLabelTests(unittest.TestCase):
    def test_none_means_permanent(self):
        self.assertIsNone(_expires_label(None))

    def test_formats_a_readable_date(self):
        self.assertEqual(
            _expires_label(datetime(2026, 12, 3, 9, 0, tzinfo=timezone.utc)),
            "3 December 2026",
        )

    def test_no_zero_padding_on_the_day(self):
        # "03 December" reads like a form field, not like a person writing.
        self.assertEqual(
            _expires_label(datetime(2026, 9, 8, tzinfo=timezone.utc)), "8 September 2026"
        )


class MembershipGrantedTemplateTests(unittest.TestCase):
    def setUp(self):
        self.t = EmailTemplates()

    def _html(self, **kw):
        kw.setdefault("user_name", "Stephanie")
        kw.setdefault("tier_display_name", "Plus")
        kw.setdefault("expires_label", "3 December 2026")
        return self.t.render_membership_granted(**kw)

    def test_states_the_tier_and_the_actual_end_date(self):
        html = self._html()
        self.assertIn("Plus", html)
        self.assertIn("3 December 2026", html)
        self.assertIn("Stephanie", html)

    def test_never_claims_a_duration(self):
        # The bug this guards: saying "a month" to someone whose comp is
        # permanent, or runs 90 days, or lapsed last week.
        html = self._html()
        for phrase in ("1 month", "one month", "2 weeks", "two weeks", "90 days"):
            self.assertNotIn(phrase, html.lower())

    def test_educator_is_told_their_class_is_covered(self):
        html = self._html(account_type="educator")
        self.assertIn("students", html.lower())
        self.assertIn("canberk@actorrise.com", html)

    def test_student_is_not_promised_they_can_comp_a_class(self):
        html = self._html(account_type="student")
        self.assertIn("teacher", html.lower())
        self.assertNotIn("your students", html.lower())

    def test_actor_gets_neither_pitch(self):
        html = self._html(account_type=None)
        self.assertNotIn("your students", html.lower())
        self.assertNotIn("your teacher", html.lower())

    def test_no_card_reassurance_is_present(self):
        self.assertIn("card", self._html().lower())

    def test_permanent_grant_says_no_end_date_and_prints_no_None(self):
        html = self._html(expires_label=None)
        self.assertNotIn("None", html)
        self.assertNotIn("until", html.lower().split("what that opens up")[0])

    def test_plain_text_alternative_exists_and_has_no_html(self):
        txt = self.t.render_membership_granted_plain(
            user_name="Stephanie", tier_display_name="Plus",
            expires_label="3 December 2026", account_type="educator",
        )
        self.assertNotIn("<", txt)
        self.assertIn("3 December 2026", txt)

    def test_no_em_dashes_anywhere(self):
        for kw in ({}, {"account_type": "educator"}, {"account_type": "student"},
                   {"expires_label": None}):
            html = self._html(**kw)
            for bad in ("—", "–", "&mdash;", "&ndash;"):
                self.assertNotIn(bad, html, f"{bad!r} found in {kw}")


class GrantNotifyFlagTests(unittest.TestCase):
    def test_notify_defaults_to_true(self):
        req = AdminGrantRequest(tier_id=4, duration_days=30, note="Educator comp")
        self.assertTrue(req.notify)

    def test_notify_can_be_turned_off(self):
        req = AdminGrantRequest(tier_id=4, duration_days=30, note="Fixing a mistake", notify=False)
        self.assertFalse(req.notify)


if __name__ == "__main__":
    unittest.main()
