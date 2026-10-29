"""Tonight's push: seven o'clock on the actor's own clock, once a night, never
to someone already in the work tonight, and a phone Expo says is gone goes off.
The widget's key opens that actor's own tonight and nothing else."""

import asyncio
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest import mock
from zoneinfo import ZoneInfo

from app.api import monologues as mono_api
from app.models.actor import FilmTvReference, Monologue, MonologueFavorite, Play
from app.models.book import TonightPick
from app.models.organization import Organization
from app.models.practice import PracticeEntry
from app.models.push import PushSend, PushToken, WidgetKey
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services import push, tonight
from tests.dbfixture import memory_db, restore

NY = "America/New_York"


def at_local(hour: int, tz: str = NY) -> datetime:
    """Today at `hour` in `tz`, as an aware UTC moment."""
    z = ZoneInfo(tz)
    now = datetime.now(z)
    return datetime(now.year, now.month, now.day, hour, 5, tzinfo=z).astimezone(timezone.utc)


class Base(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([
            Organization, User, FilmTvReference, Play, Monologue, MonologueFavorite,
            SearchLog, MonologueView, TonightPick, PracticeEntry, PushToken, PushSend, WidgetKey,
        ])
        now = datetime.now(timezone.utc)
        self.me = User(email="me@x.com", supabase_id="me", created_at=now)
        self.db.add(self.me)
        self.db.flush()
        play = Play(title="Proof", author="David Auburn", source_type="play", genre="drama",
                    category="contemporary", copyright_status="copyrighted")
        self.db.add(play)
        self.db.flush()
        for i in range(5):
            self.db.add(Monologue(play_id=play.id, title=f"S{i}", character_name="CATHERINE",
                                  text="I have waited all evening. " * 10, word_count=50,
                                  estimated_duration_seconds=40, favorite_count=10 - i, view_count=0))
        self.db.add(PushToken(user_id=self.me.id, token="ExponentPushToken[abc1234567]", tz=NY))
        self.db.commit()
        tonight._pool_cache.clear()
        self.sent = []
        p = mock.patch.object(push, "send_expo", side_effect=lambda msgs: (self.sent.extend(msgs), [{"status": "ok"} for _ in msgs])[1])
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()
        restore(self.saved)


class Tonight(Base):
    def test_seven_on_their_clock_and_once(self):
        self.assertEqual(push.run_tonight(self.db, now=at_local(18))["due"], 0)
        stats = push.run_tonight(self.db, now=at_local(19))
        self.assertEqual(stats["sent"], 1)
        self.assertEqual(self.sent[0]["title"], "Tonight's speech")
        self.assertTrue(self.sent[0]["body"].startswith("Catherine, from Proof"))
        self.assertEqual(self.sent[0]["data"]["moment"], "tonight")
        self.assertTrue(self.sent[0]["data"]["monologueId"])
        push.run_tonight(self.db, now=at_local(19) + timedelta(minutes=15))
        self.assertEqual(len(self.sent), 1)

    def test_not_when_already_in_the_work(self):
        day = at_local(19).astimezone(ZoneInfo(NY)).date()
        self.db.add(PracticeEntry(user_id=self.me.id, day=day, kind="class"))
        self.db.commit()
        stats = push.run_tonight(self.db, now=at_local(19))
        self.assertEqual((stats["skipped"], len(self.sent)), (1, 0))

    def test_a_gone_phone_is_switched_off(self):
        with mock.patch.object(push, "send_expo", return_value=[{"status": "error", "details": {"error": "DeviceNotRegistered"}}]):
            push.run_tonight(self.db, now=at_local(19))
        self.assertIsNotNone(self.db.query(PushToken).first().disabled_at)


class Widget(Base):
    def test_the_key_opens_their_own_tonight(self):
        key = asyncio.run(mono_api.tonight_widget_key(db=self.db, current_user=self.me)).key
        again = asyncio.run(mono_api.tonight_widget_key(db=self.db, current_user=self.me)).key
        self.assertEqual(key, again)
        run = asyncio.run(mono_api.tonight_widget(key=key, house="stage", days=2, tz=None, db=self.db))
        today = tonight.local_today(None)
        mine = self.db.query(TonightPick).filter(TonightPick.user_id == self.me.id, TonightPick.day == today).first()
        self.assertIsNotNone(mine)
        todays = [d for d in run.days if d.day == today.isoformat()][0]
        self.assertEqual(todays.monologue.id, mine.monologue_id)
        # A teaser, as the house run sends: the opening, cut, never the whole speech.
        full = self.db.get(Monologue, mine.monologue_id).text
        self.assertLess(len(todays.monologue.text), len(full))
        self.assertTrue(todays.monologue.text.endswith("…"))

    def test_an_unknown_key_is_the_house_run(self):
        run = asyncio.run(mono_api.tonight_widget(key="nobody-at-all", house="stage", days=2, tz=None, db=self.db))
        self.assertTrue(run.days)
        self.assertEqual(self.db.query(TonightPick).count(), 0)


if __name__ == "__main__":
    unittest.main()
