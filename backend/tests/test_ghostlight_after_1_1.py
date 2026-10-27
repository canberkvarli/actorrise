"""Ghost Light after 1.1: three reads a day, tonight's speech, the Book's lists.

Three a day refilled at the actor's own midnight; the first three distinct
pieces of the day are the ones read, and they stay open whatever is opened
after them; tonight's speech never spends one. Tonight's own pick is chosen
once a night and remembered. Lists hold kept speeches and the actor's own
scripts, and a speech that leaves the Book leaves every list with it, until
it comes back.
"""

import asyncio
import unittest
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from app.api import book as book_api
from app.middleware.rate_limiting import (
    CLIENT_GHOSTLIGHT,
    distinct_reads,
    ghostlight_open_today,
    ghostlight_reads_today,
    normalise_tz,
)
from app.models.actor import FilmTvReference, Monologue, MonologueFavorite, Play, UserScript
from app.models.book import BookList, BookListItem, TonightPick
from app.models.organization import Organization
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services import tonight
from tests.dbfixture import memory_db, restore


def run(coro):
    return asyncio.run(coro)


class Base(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([
            Organization, User, FilmTvReference, Play, Monologue, MonologueFavorite,
            UserScript, SearchLog, MonologueView, BookList, BookListItem, TonightPick,
        ])
        now = datetime.now(timezone.utc)
        self.me = User(email="me@x.com", supabase_id="me", created_at=now)
        self.other = User(email="o@x.com", supabase_id="o", created_at=now)
        self.db.add_all([self.me, self.other])
        self.db.flush()
        self.stage = Play(title="Proof", author="David Auburn", source_type="play",
                          genre="drama", category="contemporary", copyright_status="copyrighted")
        self.screen = Play(title="The Holdovers", author="David Hemingson", source_type="film",
                           genre="drama", category="contemporary", copyright_status="copyrighted")
        self.db.add_all([self.stage, self.screen])
        self.db.flush()
        self.monos = []
        for i in range(12):
            m = Monologue(
                play_id=(self.stage if i < 9 else self.screen).id,
                title=f"Speech {i}", character_name=f"Character {i}",
                text="I have waited all evening for this. " * 10, word_count=70,
                estimated_duration_seconds=40,
                character_gender="female" if i % 2 == 0 else "male",
                primary_emotion="grief" if i < 4 else "joy",
                tone="dramatic" if i < 6 else "comedic",
                favorite_count=100 - i, view_count=0,
            )
            self.monos.append(m)
        self.db.add_all(self.monos)
        self.db.commit()
        tonight._pool_cache.clear()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def view(self, m, when=None, user=None):
        self.db.add(MonologueView(
            user_id=(user or self.me).id, monologue_id=m.id, client=CLIENT_GHOSTLIGHT,
            created_at=when or datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        self.db.commit()

    def keep(self, m, user=None):
        self.db.add(MonologueFavorite(user_id=(user or self.me).id, monologue_id=m.id))
        self.db.commit()


class DailyReads(Base):
    def test_first_three_of_the_day_stay_open_after_walled_opens(self):
        a, b, c, d, e = self.monos[:5]
        for m in (a, b, c, d, e):  # d and e were opened walled
            self.view(m)
        self.view(b)  # coming back to one actually read
        today = ghostlight_reads_today(self.me.id, self.db)
        self.assertEqual(today, [a.id, b.id, c.id, d.id, e.id])
        open_today, used = ghostlight_open_today(self.me.id, self.db)
        self.assertEqual(open_today, {a.id, b.id, c.id})
        self.assertEqual(used, 3)

    def test_yesterday_is_spent_and_gone(self):
        long_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1, hours=1)
        for m in self.monos[:3]:
            self.view(m, when=long_ago)
        self.assertEqual(distinct_reads(self.me.id, self.db, client=CLIENT_GHOSTLIGHT), 0)

    def test_tonights_speech_never_spends_a_read(self):
        a, b = self.monos[:2]
        self.view(a)
        self.view(b)
        self.assertEqual(
            distinct_reads(self.me.id, self.db, client=CLIENT_GHOSTLIGHT, exempt={a.id}), 1
        )

    def test_the_day_is_the_phones(self):
        # 23:30 in Los Angeles is the next day in UTC: a read at 22:00 local
        # yesterday must not count against today, nor one at 01:00 local today
        # be lost.
        start = tonight.day_start_utc("America/Los_Angeles")
        self.view(self.monos[0], when=start - timedelta(minutes=30))
        self.view(self.monos[1], when=start + timedelta(minutes=30))
        self.assertEqual(
            ghostlight_reads_today(self.me.id, self.db, tz="America/Los_Angeles"), [self.monos[1].id]
        )

    def test_a_bad_zone_is_utc(self):
        self.assertIsNone(normalise_tz("Mars/Olympus"))
        self.assertIsNone(normalise_tz(""))
        self.assertEqual(normalise_tz("Europe/London"), "Europe/London")
        self.assertEqual(tonight.local_today("Mars/Olympus"), datetime.now(timezone.utc).date())


class TonightPicks(Base):
    def test_a_stranger_gets_the_house_pick(self):
        day = date(2026, 10, 28)
        row = tonight.pick_for(self.db, self.me.id, "stage", day)
        self.assertEqual(row.monologue_id, tonight.house_pick(tonight.house_pool(self.db, "stage"), day).id)

    def test_chosen_once_a_night(self):
        day = date(2026, 10, 28)
        first = tonight.pick_for(self.db, self.me.id, "stage", day).monologue_id
        self.keep(self.monos[8])  # the Book changing during the day changes nothing
        self.assertEqual(tonight.pick_for(self.db, self.me.id, "stage", day).monologue_id, first)
        self.assertEqual(self.db.query(TonightPick).count(), 1)

    def test_leans_toward_what_is_kept_and_never_repeats(self):
        # Kept: grief, dramatic, women. Never offered something already kept.
        for m in self.monos[0:3:2]:
            self.keep(m)
        seen = set()
        for k in range(3):  # three women's speeches are left unkept
            row = tonight.pick_for(self.db, self.me.id, "stage", date(2026, 11, 1) + timedelta(days=k))
            m = self.db.get(Monologue, row.monologue_id)
            self.assertNotIn(m.id, {self.monos[0].id, self.monos[2].id})
            self.assertNotIn(m.id, seen)
            seen.add(m.id)
            self.assertEqual(m.character_gender, "female")
            self.assertEqual(self.db.get(Play, m.play_id).source_type, "play")

    def test_not_for_me_steers_away(self):
        self.keep(self.monos[0])
        first = tonight.pick_for(self.db, self.me.id, "stage", date(2026, 11, 1))
        passed = self.db.get(Monologue, first.monologue_id)
        first.answer = "pass"
        self.db.commit()
        nxt = self.db.get(Monologue, tonight.pick_for(self.db, self.me.id, "stage", date(2026, 11, 2)).monologue_id)
        self.assertNotEqual(nxt.id, passed.id)

    def test_free_ids_cover_both_houses_and_my_own(self):
        row = tonight.pick_for(self.db, self.me.id, "stage", tonight.local_today(None))
        ids = tonight.free_tonight_ids(self.db, self.me.id, None)
        self.assertIn(row.monologue_id, ids)
        screen_pick = tonight.house_pick(tonight.house_pool(self.db, "screen"), tonight.local_today(None))
        self.assertIn(screen_pick.id, ids)


class Lists(Base):
    def test_make_fill_and_read(self):
        self.keep(self.monos[0])
        made = run(book_api.create_list(book_api.ListCreate(title="For my agent"), db=self.db, current_user=self.me))
        out = run(book_api.add_item(made.id, book_api.ItemCreate(monologue_id=self.monos[0].id),
                                    db=self.db, current_user=self.me))
        self.assertEqual([i.title for i in out.items], ["Character 0"])
        self.assertEqual(out.items[0].subtitle, "Proof")
        # Twice is once.
        out = run(book_api.add_item(made.id, book_api.ItemCreate(monologue_id=self.monos[0].id),
                                    db=self.db, current_user=self.me))
        self.assertEqual(len(out.items), 1)

    def test_only_kept_speeches_go_in(self):
        made = run(book_api.create_list(book_api.ListCreate(title="X"), db=self.db, current_user=self.me))
        with self.assertRaises(HTTPException) as e:
            run(book_api.add_item(made.id, book_api.ItemCreate(monologue_id=self.monos[1].id),
                                  db=self.db, current_user=self.me))
        self.assertEqual(e.exception.status_code, 409)

    def test_leaving_the_book_hides_it_and_coming_back_restores_it(self):
        self.keep(self.monos[0])
        made = run(book_api.create_list(book_api.ListCreate(title="X"), db=self.db, current_user=self.me))
        run(book_api.add_item(made.id, book_api.ItemCreate(monologue_id=self.monos[0].id),
                              db=self.db, current_user=self.me))
        fav = self.db.query(MonologueFavorite).first()
        fav.removed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.assertEqual(run(book_api.get_lists(db=self.db, current_user=self.me))[0].items, [])
        fav.removed_at = None
        self.db.commit()
        self.assertEqual(len(run(book_api.get_lists(db=self.db, current_user=self.me))[0].items), 1)

    def test_sides_go_in_and_deleted_sides_drop_out(self):
        script = UserScript(user_id=self.me.id, title="Doubt", author="John Patrick Shanley",
                            original_filename="d.pdf", file_type="pdf")
        self.db.add(script)
        self.db.commit()
        made = run(book_api.create_list(book_api.ListCreate(title="Callback"), db=self.db, current_user=self.me))
        out = run(book_api.add_item(made.id, book_api.ItemCreate(user_script_id=script.id),
                                    db=self.db, current_user=self.me))
        self.assertEqual(out.items[0].kind, "sides")
        script.processing_status = "deleted"
        self.db.commit()
        self.assertEqual(run(book_api.get_lists(db=self.db, current_user=self.me))[0].items, [])

    def test_order_delete_restore_and_privacy(self):
        a = run(book_api.create_list(book_api.ListCreate(title="A"), db=self.db, current_user=self.me))
        b = run(book_api.create_list(book_api.ListCreate(title="B"), db=self.db, current_user=self.me))
        out = run(book_api.order_lists(book_api.ListOrder(ids=[b.id, a.id, 999]), db=self.db, current_user=self.me))
        self.assertEqual([x.title for x in out], ["B", "A"])
        with self.assertRaises(HTTPException):
            run(book_api.rename_list(a.id, book_api.ListPatch(title="Mine now"), db=self.db, current_user=self.other))
        run(book_api.delete_list(a.id, db=self.db, current_user=self.me))
        self.assertEqual([x.title for x in run(book_api.get_lists(db=self.db, current_user=self.me))], ["B"])
        run(book_api.restore_list(a.id, db=self.db, current_user=self.me))
        self.assertEqual(len(run(book_api.get_lists(db=self.db, current_user=self.me))), 2)


if __name__ == "__main__":
    unittest.main()
