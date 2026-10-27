"""What the rehearsal room should put in front of you when you walk in.

/practice used to open on whichever script was uploaded most recently, which is
a filing order, not a working one. The page's own code carried the admission:
"FUTURE: when recent-rehearsal data lands, default to the most recently
practiced scene instead."

That data has been there all along. The run journal (ScenePartner v2) knows
which run is open and the furthest line it reached, and journal.resumable
already judges one scene. It was just never asked across all scenes at once.

whats_next answers "what is the next real thing to do", as a ladder:

  resume  an unfinished run, with the line it stopped on
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
    Scene,
    SceneFavorite,
    SceneLine,
    UserScript,
)
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.api.scenes import whats_next
from app.models.organization import Organization
from app.services.rehearsal import journal
from tests.dbfixture import memory_db, restore

_TABLES = (
    Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine,
    RehearsalRun, RehearsalEvent, SceneFavorite,
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

    def _run(self, scene, at_line=1, when=None, owner=None, closed=None):
        """A journal run that reached `at_line`. `closed` is the event that
        ended it ("completed" or "abandoned"), or None for one still open."""
        who = owner or self.user
        run = journal.create_run(self.db, who.id, scene.id, "THESEUS", {"HIPPOLYTA": "ash"})
        if when is not None:
            run.started_at = when
            self.db.commit()
        events = [{"seq": 0, "type": "started", "line_index": None, "at_ms": 0, "payload": {}},
                  {"seq": 1, "type": "line_reached", "line_index": at_line, "at_ms": 10, "payload": {}}]
        if closed:
            events.append({"seq": 2, "type": closed, "line_index": at_line, "at_ms": 20, "payload": {}})
        journal.append(self.db, run.id, who.id, events)
        return run


class TheTopRungIsUnfinishedWork(Fixture):
    def test_an_open_run_wins(self):
        scene = self._scene(self._script())
        self._run(scene, at_line=1)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "resume")
        self.assertEqual(nxt["scene"]["id"], scene.id)
        self.assertNotIn("session_id", nxt)

    def test_it_carries_the_line_you_stopped_on(self):
        """Not a progress bar. The actual words, so the screen shows writing."""
        scene = self._scene(self._script())
        self._run(scene, at_line=1)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["line"]["character"], "THESEUS")
        self.assertIn("More strange than true", nxt["line"]["text"])
        self.assertEqual(nxt["character"], "THESEUS")

    def test_it_reports_where_you_are(self):
        scene = self._scene(self._script())
        self._run(scene, at_line=2)

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["line_index"], 2)
        self.assertEqual(nxt["progress"], {"current": 2, "total": 4})

    def test_the_most_recent_run_wins(self):
        first = self._scene(self._script("Old"), act="Act 1")
        second = self._scene(self._script("New"), act="Act 5")
        now = datetime.now(timezone.utc)
        self._run(first, when=now - timedelta(hours=3))
        self._run(second, when=now - timedelta(hours=1))

        self.assertEqual(whats_next(self.db, self.user.id)["scene"]["id"], second.id)

    def test_a_closed_newer_run_does_not_hide_an_older_open_one(self):
        """The journal judges each scene by its latest run. A scene finished
        an hour ago is done; the one left open before it is still the work."""
        first = self._scene(self._script("Old"), act="Act 1")
        second = self._scene(self._script("New"), act="Act 5")
        now = datetime.now(timezone.utc)
        self._run(first, when=now - timedelta(hours=3))
        self._run(second, when=now - timedelta(hours=1), closed="completed")

        nxt = whats_next(self.db, self.user.id)
        self.assertEqual(nxt["rung"], "resume")
        self.assertEqual(nxt["scene"]["id"], first.id)

    def test_a_finished_run_is_not_unfinished_work(self):
        scene = self._scene(self._script())
        self._run(scene, closed="completed")

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_an_abandoned_run_is_not_unfinished_work(self):
        scene = self._scene(self._script())
        self._run(scene, closed="abandoned")

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_a_run_that_never_left_the_first_line_is_not_offered(self):
        """Nothing to pick up: from the top is the same place."""
        scene = self._scene(self._script())
        self._run(scene, at_line=0)

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_a_stale_run_is_not_offered(self):
        """Past the resume window. Offering one is offering a ghost."""
        scene = self._scene(self._script())
        self._run(scene, when=datetime.now(timezone.utc) - timedelta(days=14))

        self.assertEqual(whats_next(self.db, self.user.id)["rung"], "start")

    def test_someone_elses_run_is_never_offered(self):
        scene = self._scene(self._script())
        self._run(scene, owner=self.other)

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

    def test_a_script_still_being_read_is_not_offered_to_cut(self):
        # A teacher's folder mid-upload: every file "processing". The stage said
        # "nobody has cut it, cut the scenes" over the read in progress.
        reading = self._script("Reading")
        reading.processing_status = "processing"
        self.db.commit()
        self.assertIsNone(whats_next(self.db, self.user.id))

    def test_recently_deleted_is_not_on_the_stage(self):
        gone = self._script("Gone", created=datetime(2026, 9, 9))
        self._scene(gone)
        gone.processing_status = "deleted"
        kept = self._script("Kept", created=datetime(2026, 8, 1))
        self.db.commit()
        nxt = whats_next(self.db, self.user.id)
        self.assertEqual((nxt["rung"], nxt["script"]["id"]), ("cut", kept.id))


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
