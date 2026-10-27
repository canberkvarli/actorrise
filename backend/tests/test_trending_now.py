"""What others are working on is what other actors opened and saved lately."""

import unittest
from datetime import datetime, timedelta, timezone

from app.models.actor import FilmTvReference, Monologue, MonologueFavorite, Play
from app.models.organization import Organization
from app.models.search_log import MonologueView, SearchLog
from app.models.user import User
from app.services.search.recommender import Recommender
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, FilmTvReference, Play, Monologue, MonologueFavorite, SearchLog, MonologueView)


class TrendingNowTestCase(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.me, self.a, self.b = (User(email=f"{n}@example.com", hashed_password="x") for n in "mab")
        self.db.add_all([self.me, self.a, self.b])
        play = Play(title="P", author="A", genre="Drama", category="classical", copyright_status="public_domain")
        self.db.add(play)
        self.db.flush()
        self.old_hit, self.fresh, self.mine = (
            Monologue(play_id=play.id, title=t, character_name="X", text="words", word_count=1, estimated_duration_seconds=60, favorite_count=fc, view_count=0)
            for t, fc in (("Old hit", 500), ("Fresh", 0), ("Mine", 0))
        )
        self.db.add_all([self.old_hit, self.fresh, self.mine])
        self.db.flush()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Two other actors opened Fresh this week; only I opened Mine, many times.
        self.db.add_all([MonologueView(monologue_id=self.fresh.id, user_id=u.id, created_at=now) for u in (self.a, self.b)])
        self.db.add_all([MonologueView(monologue_id=self.mine.id, user_id=self.me.id, created_at=now) for _ in range(9)])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def test_recent_activity_of_others_leads_and_my_own_is_left_out(self):
        got = Recommender(self.db).get_trending_monologues(limit=2, exclude_user_id=self.me.id)
        self.assertEqual(got[0].title, "Fresh")
        self.assertEqual(got[1].title, "Old hit")  # topped up from all-time, not Mine


if __name__ == "__main__":
    unittest.main()
