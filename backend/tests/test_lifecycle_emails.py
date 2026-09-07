"""Day-3 / day-10 return emails: who gets one, once, and what it says.

Monologue and SearchLog carry Postgres-only column types, so the two anchor
lookups are patched; the window, exclusion, claim and rendering logic run
against a real in-memory database.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.email_do_not_contact import EmailDoNotContact
from app.models.lifecycle_email import LifecycleEmailSend
from app.models.organization import Organization
from app.models.user import User
from app.services.email import lifecycle
from app.services.email.templates import EmailTemplates
from tests.dbfixture import memory_db, restore

NOW = datetime.now(timezone.utc)
FAV = {"anchor": "favorite", "character": "Viola", "play": "Twelfth Night", "link": "https://actorrise.com/monologue/7"}


def _ago(hours: int) -> datetime:
    return NOW - timedelta(hours=hours)


class SelectTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, EmailDoNotContact, LifecycleEmailSend])
        self.patches = [
            mock.patch.object(lifecycle, "_paid_user_ids", lambda db: {999}),
            mock.patch.object(lifecycle, "_active_since", lambda db, uid, since: False),
            mock.patch.object(lifecycle, "_favorite_anchor", lambda db, uid: None),
            mock.patch.object(lifecycle, "_search_anchor", lambda db, uid: None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        restore(self.saved)

    def _user(self, email, hours_ago=80, opt_in=True, **kw):
        u = User(email=email, supabase_id=email, marketing_opt_in=opt_in, created_at=_ago(hours_ago), **kw)
        self.db.add(u)
        self.db.commit()
        return u

    def test_window_selects_day3_and_day10_separately(self):
        self._user("d3@x.com", hours_ago=80)
        self._user("d10@x.com", hours_ago=250)
        self._user("fresh@x.com", hours_ago=10)
        self._user("old@x.com", hours_ago=400)
        d3 = [p["email"] for p in lifecycle.select_candidates(self.db, "day3")]
        d10 = [p["email"] for p in lifecycle.select_candidates(self.db, "day10")]
        self.assertEqual(d3, ["d3@x.com"])
        self.assertEqual(d10, ["d10@x.com"])

    def test_exclusions(self):
        self._user("ok@x.com")
        self._user("ghost@anon.actorrise.com")
        self._user("me@actorrise.com")
        self._user("hide@privaterelay.appleid.com")
        self._user("out@x.com", opt_in=False)
        self._user("staff@x.com", exclude_from_stats=True)
        self._user("dnc@x.com")
        self.db.add(EmailDoNotContact(email="DNC@x.com", reason="unsubscribed"))
        self.db.commit()
        got = [p["email"] for p in lifecycle.select_candidates(self.db, "day3")]
        self.assertEqual(got, ["ok@x.com"])

    def test_paid_and_recently_active_are_left_alone(self):
        paid = self._user("paid@x.com")
        with mock.patch.object(lifecycle, "_paid_user_ids", lambda db: {paid.id}):
            self.assertEqual(lifecycle.select_candidates(self.db, "day3"), [])
        with mock.patch.object(lifecycle, "_active_since", lambda db, uid, since: True):
            self.assertEqual(lifecycle.select_candidates(self.db, "day3"), [])

    def test_hour_match(self):
        u = self._user("h@x.com")
        hour = u.created_at.hour
        self.assertEqual(len(lifecycle.select_candidates(self.db, "day3", active_hour=hour)), 1)
        self.assertEqual(lifecycle.select_candidates(self.db, "day3", active_hour=(hour + 1) % 24), [])

    def test_already_sent_touch_is_skipped_but_other_touch_is_not(self):
        u = self._user("once@x.com", hours_ago=260)
        self.db.add(LifecycleEmailSend(user_id=u.id, touch="day3", anchor="none"))
        self.db.commit()
        self.assertEqual(len(lifecycle.select_candidates(self.db, "day10")), 1)
        self.db.add(LifecycleEmailSend(user_id=u.id, touch="day10", anchor="none"))
        self.db.commit()
        self.assertEqual(lifecycle.select_candidates(self.db, "day10"), [])

    def test_anchor_priority_and_recent_reminder_skip(self):
        u = self._user("a@x.com")
        with mock.patch.object(lifecycle, "_favorite_anchor", lambda db, uid: dict(FAV, favorite_reminded_at=_ago(100))):
            (p,) = lifecycle.select_candidates(self.db, "day3")
            self.assertEqual(p["anchor"], "favorite")
            self.assertNotIn("favorite_reminded_at", p)
        # Day-1 saved-piece email went out yesterday: hold the day-3 nudge.
        with mock.patch.object(lifecycle, "_favorite_anchor", lambda db, uid: dict(FAV, favorite_reminded_at=_ago(20))):
            self.assertEqual(lifecycle.select_candidates(self.db, "day3"), [])
        with mock.patch.object(lifecycle, "_search_anchor", lambda db, uid: lifecycle.search_anchor_from_query("hamlet")):
            (p,) = lifecycle.select_candidates(self.db, "day3")
            self.assertEqual(p["anchor"], "search")
            self.assertEqual(p["link"], "https://actorrise.com/monologues?q=hamlet")
        (p,) = lifecycle.select_candidates(self.db, "day3")
        self.assertEqual(p["anchor"], "none")
        self.assertEqual(p["user_id"], u.id)

    def test_claim_is_once_per_user_and_touch(self):
        u = self._user("c@x.com")
        self.assertTrue(lifecycle._claim(self.db, u.id, "day3", "none"))
        self.assertFalse(lifecycle._claim(self.db, u.id, "day3", "none"))
        self.assertTrue(lifecycle._claim(self.db, u.id, "day10", "none"))
        self.assertEqual(self.db.query(LifecycleEmailSend).count(), 2)

    def test_run_touch_sends_once_and_records(self):
        self._user("r@x.com")
        sent = []
        client = mock.Mock()
        client.send_email.side_effect = lambda **kw: sent.append(kw)
        with mock.patch.object(lifecycle, "SessionLocal", lambda: _NoClose(self.db)), \
             mock.patch.object(lifecycle, "ResendEmailClient", lambda: client), \
             mock.patch.object(lifecycle, "build_unsubscribe_url", lambda e: "https://actorrise.com/unsubscribe?x"):
            first = lifecycle.run_touch("day3", send=True)
            second = lifecycle.run_touch("day3", send=True)
        self.assertEqual((first["eligible"], first["sent"]), (1, 1))
        self.assertEqual((second["eligible"], second["sent"]), (0, 0))
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["to"], "r@x.com")
        self.assertEqual(sent[0]["subject"], "try one search")
        self.assertIn("actorrise.com/monologues", sent[0]["plain_text"])


class SearchAnchorTests(unittest.TestCase):
    def test_normalises_and_truncates(self):
        a = lifecycle.search_anchor_from_query("  angry   \n monologue  ")
        self.assertEqual(a["query"], "angry monologue")
        self.assertEqual(a["link"], "https://actorrise.com/monologues?q=angry%20monologue")
        self.assertIsNone(lifecycle.search_anchor_from_query("hi"))
        self.assertIsNone(lifecycle.search_anchor_from_query(None))
        self.assertEqual(len(lifecycle.search_anchor_from_query("x" * 500)["query"]), lifecycle.MAX_QUERY_LEN)


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.tpl = EmailTemplates()

    def _all(self):
        for touch in lifecycle.TOUCHES:
            for anchor in (dict(FAV), lifecycle.search_anchor_from_query("funny monologue"), {"anchor": "none", "link": "https://actorrise.com/monologues"}):
                person = {"touch": touch, "user_name": "Ada Lovelace", **anchor}
                yield person, lifecycle.render(self.tpl, person, "https://actorrise.com/unsubscribe?x")

    def test_voice_rules_and_link_in_every_variant(self):
        for person, (subject, html, plain) in self._all():
            for body in (subject, html, plain):
                self.assertNotIn("—", body, person)  # em dash
                self.assertNotIn("–", body, person)  # en dash
            for body in (plain,):
                self.assertNotRegex(body, r"\b(we|our|us)\b", person)
            self.assertIn(person["link"], plain, person)
            self.assertIn(person["link"], html, person)
            self.assertIn("hey ada,", plain)
            self.assertIn("reply unsubscribe", plain)
            self.assertIn("canberk", plain)

    def test_subjects(self):
        self.assertEqual(lifecycle.render(self.tpl, {"touch": "day3", **FAV}, None)[0], "have you run Viola yet?")
        self.assertEqual(lifecycle.render(self.tpl, {"touch": "day10", **FAV}, None)[0], "one question")

    def test_search_anchor_shows_the_query(self):
        person = {"touch": "day3", **lifecycle.search_anchor_from_query("funny monologue")}
        _, html, plain = lifecycle.render(self.tpl, person, None)
        self.assertIn('"funny monologue"', plain)
        self.assertIn("funny monologue", html)


class _NoClose:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return getattr(self._db, name)

    def close(self):
        pass


if __name__ == "__main__":
    unittest.main()
