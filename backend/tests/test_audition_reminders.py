"""Audition reminders: when each moment is due, one email a day, the claim, the copy."""

import re
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.actor import UserScript
from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.email_do_not_contact import EmailDoNotContact
from app.models.organization import Organization
from app.models.user import User
from app.services.auditions import reminders
from tests.dbfixture import memory_db, restore

NY = "America/New_York"


def utc(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


def aud(**kw):
    base = dict(id=1, user_id=1, project="The Glass Menagerie", role="Laura", kind="in_person",
                status="scheduled", tz=NY, reminders_on=True, outcome_token="tok",
                created_at=utc(2026, 9, 30, 12), starts_at=utc(2026, 10, 9, 14, 40))  # Thu 10:40 EDT
    base.update(kw)
    return Audition(**base)


class DueTests(unittest.TestCase):
    def test_prep_three_days_before_at_6pm_local(self):
        a = aud()
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 6, 22, 0)), ["prep"])  # Mon 6pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 6, 21, 59)), [])

    def test_eve_at_7pm_the_day_before(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 8, 23, 30)), ["eve"])  # Wed 7:30pm EDT

    def test_after_at_9am_the_day_after(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 10, 13, 5)), ["after"])  # Fri 9:05am EDT

    def test_no_eve_once_the_audition_day_has_begun(self):
        # Eve window runs 7pm to 1am; at 12:10am the audition is "today", not "tomorrow".
        a = aud(starts_at=utc(2026, 10, 9, 14, 0))  # Fri 10am EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 9, 4, 10)), [])  # Fri 12:10am EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 9, 3, 50)), ["eve"])  # Thu 11:50pm EDT

    def test_window_closes_after_six_hours(self):
        self.assertEqual(reminders.due_moments(aud(), utc(2026, 10, 7, 4, 1)), [])

    def test_added_late_gets_prep_soon_after_creation(self):
        a = aud(created_at=utc(2026, 10, 7, 16, 0))  # inside the 3 days
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 7, 17, 0)), ["prep"])

    def test_added_the_night_before_skips_prep_and_gets_eve(self):
        a = aud(created_at=utc(2026, 10, 9, 0, 30))  # Wed 8:30pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 9, 1, 0)), ["eve"])

    def test_dst_change_uses_local_clock(self):
        # Sun Nov 1 2026 clocks go back in New York. Audition Tue Nov 3 10:00 EST = 15:00 UTC.
        a = aud(starts_at=utc(2026, 11, 3, 15, 0))
        self.assertEqual(reminders.due_moments(a, utc(2026, 11, 3, 0, 0)), ["eve"])  # Mon 7pm EST

    def test_self_tape_keys_off_due_at(self):
        a = aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 21, 0))  # Mon 5pm EDT
        self.assertEqual(reminders.due_moments(a, utc(2026, 10, 11, 23, 10)), ["eve"])

    def test_muted_closed_and_undated_never_due(self):
        t = utc(2026, 10, 8, 23, 30)
        self.assertEqual(reminders.due_moments(aud(reminders_on=False), t), [])
        self.assertEqual(reminders.due_moments(aud(status="booked"), t), [])
        self.assertEqual(reminders.due_moments(aud(starts_at=None), t), [])
        self.assertEqual(reminders.due_moments(aud(deleted_at=t), t), [])


class RunTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserScript, EmailDoNotContact, Audition, AuditionPiece,
                                         AuditionEvent, AuditionReminderSend])
        self.user = User(email="maya@x.com", supabase_id="m", name="Maya Lopez")
        self.db.add(self.user)
        self.db.commit()
        self.sent = []
        self.client = mock.Mock()
        self.client.send_email.side_effect = lambda **kw: self.sent.append(kw)
        self.patches = [
            mock.patch.object(reminders, "record_user_event", lambda *a, **k: None),
            mock.patch.object(reminders, "count_runs", lambda db, a, pieces: (3, None)),
            mock.patch.object(reminders, "build_unsubscribe_url", lambda e: "https://actorrise.com/unsubscribe?t=1"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        restore(self.saved)

    def _add(self, **kw):
        data = dict(user_id=self.user.id, project="The Glass Menagerie", role="Laura", tz=NY,
                    created_at=utc(2026, 9, 30, 12), starts_at=utc(2026, 10, 9, 14, 40))
        data.update(kw)
        a = Audition(**data)
        self.db.add(a)
        self.db.commit()
        return a

    def test_sends_once_and_records(self):
        a = self._add()
        t = utc(2026, 10, 8, 23, 30)
        stats = reminders.run(self.db, now=t, send=True, client=self.client)
        self.assertEqual(stats["sent"], 1)
        self.assertEqual(self.sent[0]["to"], "maya@x.com")
        self.assertEqual(self.db.query(AuditionReminderSend).one().moment, "eve")
        self.assertEqual(self.db.query(AuditionEvent).filter_by(kind="reminder_sent").one().data, {"moment": "eve"})
        reminders.run(self.db, now=t + timedelta(hours=1), send=True, client=self.client)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(a.id, self.db.query(AuditionReminderSend).one().audition_id)

    def test_one_email_per_local_day_nearest_wins(self):
        near = self._add(project="Near")
        self._add(project="Far", starts_at=utc(2026, 10, 9, 18, 0))
        reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=True, client=self.client)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Near", self.sent[0]["subject"])
        self.assertEqual(self.db.query(AuditionReminderSend).one().audition_id, near.id)

    def test_do_not_contact_and_anon_are_skipped(self):
        self._add()
        self.db.add(EmailDoNotContact(email="MAYA@x.com", reason="OPT-OUT: test"))
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=True, client=self.client)["sent"], 0)

    def test_dry_run_sends_nothing_and_claims_nothing(self):
        self._add()
        stats = reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=False, client=self.client)
        self.assertEqual(stats["eligible"], 1)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.db.query(AuditionReminderSend).count(), 0)

    def test_claim_lands_before_the_send_and_a_failed_send_is_not_retried(self):
        self._add()
        seen = []
        self.client.send_email.side_effect = lambda **kw: (
            seen.append(self.db.query(AuditionReminderSend).count()), (_ for _ in ()).throw(RuntimeError("down")))
        t = utc(2026, 10, 8, 23, 30)
        stats = reminders.run(self.db, now=t, send=True, client=self.client)
        self.assertEqual((stats["sent"], stats["failed"]), (0, 1))
        self.assertEqual(seen, [1])
        self.assertEqual(reminders.run(self.db, now=t + timedelta(hours=1), send=False)["eligible"], 0)

    def test_an_earlier_send_today_blocks_another_audition(self):
        other = self._add(project="Other", starts_at=utc(2026, 10, 20, 14, 0))
        self.db.add(AuditionReminderSend(audition_id=other.id, user_id=self.user.id, moment="prep",
                                         local_day="2026-10-08"))
        self._add(project="Near")
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=False)["eligible"], 0)

    def test_after_skipped_once_an_outcome_is_logged(self):
        a = self._add()
        t = utc(2026, 10, 10, 13, 5)  # Fri 9:05am EDT, after is due
        self.assertEqual(reminders.run(self.db, now=t, send=False)["previews"], [(a.id, "after")])
        self.db.add(AuditionEvent(audition_id=a.id, user_id=self.user.id, kind="outcome_logged",
                                  data={"outcome": "good", "via": "app"}))
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=t, send=False)["eligible"], 0)

    def test_after_skipped_when_moved_to_callback_after_the_audition(self):
        a = self._add()
        a.status = "callback"
        self.db.add(AuditionEvent(audition_id=a.id, user_id=self.user.id, kind="status_changed",
                                  data={"from": "scheduled", "to": "callback"},
                                  created_at=utc(2026, 10, 9, 20, 0)))
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=utc(2026, 10, 10, 13, 5), send=False)["eligible"], 0)

    def test_after_still_sent_for_a_callback_booked_as_callback(self):
        # A ticket that IS a callback appointment has no outcome yet.
        a = self._add(status="callback")
        self.db.add(AuditionEvent(audition_id=a.id, user_id=self.user.id, kind="status_changed",
                                  data={"from": "scheduled", "to": "callback"},
                                  created_at=utc(2026, 10, 1, 12, 0)))
        self.db.commit()
        self.assertEqual(reminders.run(self.db, now=utc(2026, 10, 10, 13, 5), send=False)["eligible"], 1)

    def test_db_error_mid_send_rolls_back_and_keeps_going(self):
        self._add(project="First")
        other = User(email="sam@x.com", supabase_id="s", name="Sam")
        self.db.add(other)
        self.db.commit()
        self._add(project="Second", user_id=other.id)
        real_add = self.db.add
        calls = {"n": 0}

        def flaky_add(obj):
            if isinstance(obj, AuditionEvent) and calls["n"] == 0:
                calls["n"] += 1
                real_add(AuditionEvent(audition_id=obj.audition_id, user_id=obj.user_id, kind=None, data={}))
                return
            real_add(obj)

        with mock.patch.object(self.db, "add", side_effect=flaky_add):
            stats = reminders.run(self.db, now=utc(2026, 10, 8, 23, 30), send=True, client=self.client)
        self.assertEqual((stats["sent"], stats["failed"]), (1, 1))
        self.assertEqual(self.db.query(AuditionReminderSend).count(), 2)  # both claims survive

    def test_far_off_auditions_are_not_loaded(self):
        self._add(starts_at=utc(2026, 12, 1, 14, 0))
        self.assertEqual(reminders.select_due(self.db, utc(2026, 10, 8, 23, 30)), [])

    def test_prep_subject_counts_days_from_the_run_clock(self):
        self._add()
        reminders.run(self.db, now=utc(2026, 10, 6, 22, 30), send=True, client=self.client)
        self.assertEqual(self.sent[0]["subject"], "The Glass Menagerie is in 3 days")


class CopyTests(unittest.TestCase):
    def test_every_moment_has_copy_and_no_strays(self):
        files = {p.stem for p in reminders.COPY_DIR.glob("*.txt")}
        self.assertEqual(files, set(reminders.MOMENTS))

    def test_voice_and_nothing_unfilled(self):
        cases = [
            aud(),
            aud(kind="self_tape", starts_at=None, due_at=utc(2026, 10, 12, 21, 0), role=None),
            aud(user_script_id=4, material_raw="1 min contemporary", location="Ripley Grier", bring="headshot"),
        ]
        for a in cases:
            for moment in reminders.MOMENTS:
                subject, html, plain = reminders.render(a, moment, "Maya Lopez", runs=2,
                                                        unsubscribe_url="https://actorrise.com/unsubscribe?t=1")
                for out in (subject, plain):
                    self.assertIsNone(re.search(r"[‒–—―]| - ", out), (moment, out))
                    self.assertIsNone(re.search(r"\b(we|our|us)\b", out, re.I), (moment, out))
                    self.assertNotRegex(out, r"\{[a-z_]+\}")
                self.assertLessEqual(len(subject), 60)
                self.assertTrue(plain.rstrip().endswith("\ncanberk"), moment)
                self.assertNotIn("unsubscribe", plain.lower())
                self.assertIn("https://actorrise.com/unsubscribe?t=1", html)

    def test_eve_run_line_only_claims_runs_when_something_is_linked(self):
        def eve(a, runs):
            _, _, plain = reminders.render(a, "eve", "Maya", runs=runs, unsubscribe_url=None,
                                           now=utc(2026, 10, 8, 23, 0), has_material=None)
            return next(ln for ln in plain.splitlines() if "http" in ln and "ar=eve" in ln)
        self.assertEqual(eve(aud(), 0), "if you have a minute tonight, open your prep room: https://actorrise.com/auditions/1?ar=eve")
        linked = aud(user_script_id=4)
        self.assertIn("you haven't run it here yet. one run before bed:", eve(linked, 0))
        self.assertIn("you've run it once. one more run before bed:", eve(linked, 1))
        self.assertIn("you've run it 3 times. one more run before bed:", eve(linked, 3))
        _, _, plain = reminders.render(aud(), "eve", "Maya", runs=0, unsubscribe_url=None, has_material=True)
        self.assertIn("you haven't run it here yet", plain)

    def test_after_links_carry_the_token(self):
        _, html, plain = reminders.render(aud(), "after", "Maya", runs=0, unsubscribe_url=None)
        for o in ("good", "callback", "no"):
            self.assertIn(f"/api/auditions/outcome/tok?o={o}", plain)
            self.assertIn(f"/api/auditions/outcome/tok?o={o}", html)


if __name__ == "__main__":
    unittest.main()
