"""Audition tracker: the tables, the service, the prep steps."""

import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.actor import UserScript
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
TABLES = [Organization, User, UserScript, Audition, AuditionPiece, AuditionEvent, AuditionReminderSend]


class TableTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        restore(self.saved)

    def test_audition_gets_a_token_and_defaults(self):
        a = Audition(user_id=self.user.id, project="The Glass Menagerie", tz="America/New_York")
        self.db.add(a)
        self.db.commit()
        self.assertTrue(a.outcome_token and len(a.outcome_token) >= 24)
        self.assertTrue(a.reminders_on)
        self.assertEqual(a.kind, "in_person")
        self.assertEqual(a.source, "manual")

    def test_reminder_claim_is_unique_per_moment(self):
        a = Audition(user_id=self.user.id, project="P", tz="UTC")
        self.db.add(a)
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        self.db.commit()
        self.db.add(AuditionReminderSend(audition_id=a.id, user_id=self.user.id, moment="eve", local_day="2026-10-08"))
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()


class VocabularyTests(unittest.TestCase):
    def test_tracker_events_are_known(self):
        from app.services.events import CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES

        server = {
            "audition_created", "audition_status_changed", "audition_outcome_logged",
            "audition_parse_requested", "audition_parse_failed", "audition_reminder_sent",
        }
        client = {
            "audition_parse_corrected", "audition_prep_started", "audition_reminder_clicked",
            "audition_landing_shown", "audition_strip_clicked", "calendar_feed_subscribed",
        }
        self.assertTrue(server <= SERVER_EVENT_NAMES, server - SERVER_EVENT_NAMES)
        self.assertTrue(client <= CLIENT_EVENT_NAMES, client - CLIENT_EVENT_NAMES)


from unittest import mock  # noqa: E402

from app.services.auditions import core  # noqa: E402


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.other = User(email="b@x.com", supabase_id="b")
        self.db.add_all([self.user, self.other])
        self.db.commit()
        self.events = []
        self.p = mock.patch.object(core, "record_user_event", lambda uid, name, props=None: self.events.append((name, props)))
        self.p.start()

    def tearDown(self):
        self.p.stop()
        restore(self.saved)

    def _make(self, **kw):
        data = {"project": "The Glass Menagerie", "role": "Laura", "tz": "America/New_York"}
        data.update(kw)
        return core.create_audition(self.db, self.user.id, data, source="manual", now=NOW)

    def test_casting_key_groups_spellings(self):
        self.assertEqual(core.casting_key("Telsey + Co. Casting"), core.casting_key("telsey co"))
        self.assertIsNone(core.casting_key("   "))

    def test_create_sets_status_from_date_and_writes_events(self):
        dated = self._make(starts_at=NOW + timedelta(days=2))
        undated = self._make()
        self.assertEqual(dated.status, "scheduled")
        self.assertEqual(undated.status, "submitted")
        kinds = [e.kind for e in self.db.query(AuditionEvent).all()]
        self.assertEqual(kinds, ["created", "created"])
        self.assertEqual(self.events[0][0], "audition_created")
        self.assertEqual(self.events[0][1]["source"], "manual")

    def test_create_rejects_bad_kind_and_blank_project(self):
        with self.assertRaises(ValueError):
            self._make(kind="hologram")
        with self.assertRaises(ValueError):
            self._make(project="  ")

    def test_update_status_writes_status_changed(self):
        a = self._make(starts_at=NOW + timedelta(days=2))
        core.update_audition(self.db, a, {"status": "callback", "location": "Ripley Grier"})
        self.assertEqual(a.status, "callback")
        ev = self.db.query(AuditionEvent).filter_by(kind="status_changed").one()
        self.assertEqual(ev.data, {"from": "scheduled", "to": "callback"})
        self.assertIn(("audition_status_changed", {"audition_id": a.id, "from": "scheduled", "to": "callback"}), self.events)

    def test_update_ignores_unknown_fields(self):
        a = self._make()
        core.update_audition(self.db, a, {"user_id": self.other.id, "outcome_token": "x"})
        self.assertEqual(a.user_id, self.user.id)
        self.assertNotEqual(a.outcome_token, "x")

    def test_outcome_moves_status(self):
        a = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, a, "callback", via="email")
        self.assertEqual(a.status, "callback")
        core.log_outcome(self.db, a, "no", via="app")
        self.assertEqual(a.status, "passed")
        b = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, b, "good", via="email")
        self.assertEqual(b.status, "scheduled")
        with self.assertRaises(ValueError):
            core.log_outcome(self.db, b, "meh", via="app")

    def test_same_outcome_twice_is_a_no_op(self):
        a = self._make(starts_at=NOW - timedelta(hours=20))
        core.log_outcome(self.db, a, "callback", via="email")
        core.log_outcome(self.db, a, "callback", via="email")
        self.assertEqual(self.db.query(AuditionEvent).filter_by(kind="outcome_logged").count(), 1)

    def test_scope(self):
        up = self._make(starts_at=NOW + timedelta(days=1))
        waiting = self._make(starts_at=NOW - timedelta(days=3))
        undated = self._make()
        booked = self._make(starts_at=NOW - timedelta(days=3))
        core.update_audition(self.db, booked, {"status": "booked"})
        stale = self._make(starts_at=NOW - timedelta(days=90))
        self.assertEqual(core.scope_of(up, NOW), "upcoming")
        self.assertEqual(core.scope_of(waiting, NOW), "waiting")
        self.assertEqual(core.scope_of(undated, NOW), "waiting")
        self.assertEqual(core.scope_of(booked, NOW), "past")
        self.assertEqual(core.scope_of(stale, NOW), "past")

    def test_list_is_per_user_sorted_and_skips_deleted(self):
        later = self._make(project="Later", starts_at=NOW + timedelta(days=9))
        sooner = self._make(project="Sooner", starts_at=NOW + timedelta(days=1))
        gone = self._make(project="Gone", starts_at=NOW + timedelta(days=2))
        core.delete_audition(self.db, gone, now=NOW)
        core.create_audition(self.db, self.other.id, {"project": "Theirs", "tz": "UTC"}, source="manual", now=NOW)
        names = [a.project for a in core.list_auditions(self.db, self.user.id, NOW)]
        self.assertEqual(names, ["Sooner", "Later"])
        self.assertEqual(later.status, "scheduled")

    def test_next_upcoming_only_inside_window(self):
        self._make(project="Far", starts_at=NOW + timedelta(days=20))
        self.assertIsNone(core.next_upcoming(self.db, self.user.id, NOW))
        self._make(project="Near", starts_at=NOW + timedelta(days=3))
        self.assertEqual(core.next_upcoming(self.db, self.user.id, NOW).project, "Near")

    def test_get_owned(self):
        a = self._make()
        self.assertIs(core.get_owned(self.db, self.user.id, a.id), a)
        self.assertIsNone(core.get_owned(self.db, self.other.id, a.id))

    def test_add_piece_needs_exactly_one(self):
        a = self._make()
        core.add_piece(self.db, a, monologue_id=7)
        with self.assertRaises(ValueError):
            core.add_piece(self.db, a)
        with self.assertRaises(ValueError):
            core.add_piece(self.db, a, monologue_id=1, scene_id=2)
        self.assertEqual(self.db.query(AuditionPiece).count(), 1)


class PrepStepTests(unittest.TestCase):
    def _a(self, **kw):
        return Audition(id=5, project="P", tz="UTC", **kw)

    def test_sides_first_then_piece(self):
        steps = core.build_prep_steps(self._a(user_script_id=9, material_raw="1 min contemporary comedic"), runs=0, piece_count=0)
        self.assertEqual([s["key"] for s in steps], ["sides", "piece"])
        self.assertEqual(steps[0]["href"], "/practice?script=9")
        self.assertFalse(steps[0]["done"])
        self.assertEqual(steps[1]["href"], "/monologues?q=1+min+contemporary+comedic")

    def test_done_flags(self):
        steps = core.build_prep_steps(self._a(user_script_id=9, material_raw="x"), runs=2, piece_count=1)
        self.assertTrue(all(s["done"] for s in steps))

    def test_nothing_known_asks_what_you_are_bringing(self):
        (step,) = core.build_prep_steps(self._a(), runs=0, piece_count=0)
        self.assertEqual(step["key"], "bring")
        self.assertEqual(step["href"], "/rehearse")


if __name__ == "__main__":
    unittest.main()
