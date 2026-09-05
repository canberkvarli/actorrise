"""What the rehearsal room should put in front of you when you walk in.

/practice used to open on whichever script was uploaded most recently, which is
a filing order, not a working one. The page's own code carried the admission:
"FUTURE: when recent-rehearsal data lands, default to the most recently
practiced scene instead."

That data has been there all along. rehearsal_sessions stores status,
current_line_index, max_lines and started_at, and /scenes/{id}/resumable-session
already knows how to judge staleness. It was just never asked across all scenes
at once.

whats_next answers "what is the next real thing to do", as a ladder:

  resume  an unfinished session, with the line it stopped on
  start   no session, but scenes are ready, so the first line of the newest one
  cut     a script arrived but has no scenes yet
  demo    nothing of your own, so the sample play's opening line

Only 37 accounts have ever rehearsed anything, so `resume` is the rare rung and
`start` is what most people will meet. Every rung carries a real line of
dialogue for that reason: the screen should always show a piece of writing, and
never a status message.
"""

import unittest
from datetime import datetime, timedelta, timezone

from app.models.actor import (
    FilmTvReference,
    Play,
    RehearsalLineDelivery,
    RehearsalSession,
    Scene,
    SceneFavorite,
    SceneLine,
    UserScript,
)
from app.models.user import User
from app.api.scenes import whats_next
from tests.dbfixture import memory_db, restore

_TABLES = (
    User, FilmTvReference, Play, UserScript, Scene, SceneLine,
    RehearsalSession, RehearsalLineDelivery, SceneFavorite,
)

LINES = [
    ("HIPPOLYTA", "'Tis strange, my Theseus, that these lovers speak of."),
    ("THESEUS", "More strange than true. I never may believe"),
    ("HIPPOLYTA", "But all the story of the night told over,"),
    ("THESEUS", "Here come the lovers, full of joy and mirth."),
]


class Fixture(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="actor@example.com", hashed_password="x")
        self.other = User(email="someone.else@example.com", hashed_password="x")
        self.play = Play(
            title="A Midsummer Night's Dream", author="William Shakespeare",
            genre="Comedy", category="classical",
            copyright_status="public_domain", license_type="public_domain",
        )
        self.db.add_all([self.user, self.other, self.play])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def _script(self, title="Mnd", owner=None, created=None, is_sample=False):
        script = UserScript(
            user_id=(owner or self.user).id if not is_sample else None,
            title=title, author="William Shakespeare",
            original_filename=f"{title}.pdf", file_type="pdf",
            processing_status="completed", is_sample=is_sample,
            created_at=created or datetime(2026, 9, 1, tzinfo=timezone.utc).replace(tzinfo=None),
        )
        self.db.add(script)
        self.db.commit()
        return script

    def _scene(self, script, act="Act 5", number="Scene 1", lines=LINES):
        scene = Scene(
            play_id=self.play.id, user_script_id=script.id,
            title=f"{act} {number}", act=act, scene_number=number,
            character_1_name="THESEUS", character_2_name="HIPPOLYTA",
            line_count=len(lines), estimated_duration_seconds=30,
        )
        self.db.add(scene)
        self.db.commit()
        for i, (who, text) in enumerate(lines):
            self.db.add(SceneLine(
                scene_id=scene.id, line_order=i, character_name=who,
                text=text, word_count=len(text.split()),
            ))
        self.db.commit()
        return scene

    def _session(self, scene, status="in_progress", at_line=1, when=None, owner=None):
        session = RehearsalSession(
            user_id=(owner or self.user).id, scene_id=scene.id,
            user_character="THESEUS", ai_character="HIPPOLYTA",
            status=status, current_line_index=at_line, max_lines=len(LINES),
            started_at=when or datetime.now(timezone.utc).replace(tzinfo=None),
        )
        self.db.add(session)
        self.db.commit()
        return session


class TheTopRungIsUnfinishedWork(Fixture):
    def test_an_open_session_wins(self):
        scene = self._scene(self._script())
        self._session(scene, at_line=1)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "resume")
        self.assertEqual(nxt["scene"]["id"], scene.id)

    def test_it_carries_the_line_you_stopped_on(self):
        """Not a progress bar. The actual words, so the screen shows writing."""
        scene = self._scene(self._script())
        self._session(scene, at_line=1)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["line"]["character"], "THESEUS")
        self.assertIn("More strange than true", nxt["line"]["text"])

    def test_it_reports_where_you_are(self):
        scene = self._scene(self._script())
        self._session(scene, at_line=2)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["progress"], {"current": 2, "total": 4})

    def test_the_most_recent_session_wins(self):
        first = self._scene(self._script("Old"), act="Act 1")
        second = self._scene(self._script("New"), act="Act 5")
        self._session(first, when=datetime(2026, 9, 1))
        self._session(second, when=datetime(2026, 9, 4))

        self.assertEqual(whats_next(self.db, self.user.id)["scene"]["id"], second.id)

    def test_a_finished_session_is_not_unfinished_work(self):
        scene = self._scene(self._script())
        self._session(scene, status="completed")

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_a_stale_session_is_not_offered(self):
        """The hourly sweep abandons these. Offering one is offering a ghost."""
        scene = self._scene(self._script())
        self._session(scene, when=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14))

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_someone_elses_session_is_never_offered(self):
        scene = self._scene(self._script())
        self._session(scene, owner=self.other)

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")


class WithNothingOpenItOffersSomethingToStart(Fixture):
    def test_the_newest_script_with_scenes(self):
        self._scene(self._script("Old", created=datetime(2026, 8, 1)), act="Act 1")
        newer = self._scene(self._script("New", created=datetime(2026, 9, 4)), act="Act 5")

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "start")
        self.assertEqual(nxt["scene"]["id"], newer.id)

    def test_it_opens_on_the_first_line(self):
        self._scene(self._script())

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["line"]["character"], "HIPPOLYTA")
        self.assertIn("'Tis strange", nxt["line"]["text"])


class AScriptWithNoScenesAsksToBeCut(Fixture):
    def test_rung_is_cut(self):
        script = self._script()

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "cut")
        self.assertEqual(nxt["script"]["id"], script.id)
        self.assertIsNone(nxt["line"])


class WithNothingOfYourOwnTheDemoSpeaks(Fixture):
    def test_rung_is_demo(self):
        demo = self._script("Hamlet", is_sample=True)
        self._scene(demo, act="Act 3", number="Scene 1")

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "demo")
        self.assertIn("'Tis strange", nxt["line"]["text"])

    def test_an_account_with_nothing_at_all_gets_nothing(self):
        """No demo seeded, no scripts. The caller shows the upload invitation."""
        self.assertIsNone(whats_next(self.db, self.user.id))


if __name__ == "__main__":
    unittest.main()
