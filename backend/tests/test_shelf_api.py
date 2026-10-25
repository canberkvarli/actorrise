"""The scene shelf's API: browse, share a pointer, take a scene into rehearsal."""

import unittest
from datetime import datetime, timezone
from unittest import mock

import app.models  # noqa: F401  every mapper the relationships name
from fastapi import HTTPException

from app.api import shelf as api
from app.models.actor import FilmTvReference, Play, RehearsalSession, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.shelf import ShelfScene
from app.models.user import User
from app.services.extraction import scene_cutter
from tests.dbfixture import memory_db, restore

LINE_A = "I have been waiting for you all evening and you know it very well indeed."
LINE_B = "Then you should have gone home, because I was never going to come tonight."
PLAY_TEXT = "THE PLAY\n\nACT I\n\n" + "\n".join(
    f"Nora. {LINE_A} {i}.\n\nHelmer. {LINE_B} {i}.\n" for i in range(6)
)


class ShelfApiTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, ShelfScene,
                                               RehearsalRun, RehearsalEvent, RehearsalSession])
        now = datetime.now(timezone.utc)
        self.me = User(email="me@gmail.com", hashed_password="x", name="Maya Lopez", created_at=now)
        self.other = User(email="o@gmail.com", hashed_password="x", name="Sam", created_at=now)
        self.mod = User(email="m@actorrise.com", hashed_password="x", is_moderator=True, created_at=now)
        self.db.add_all([self.me, self.other, self.mod])
        self.play = Play(title="A Doll's House", author="Henrik Ibsen", genre="drama", category="classical",
                         copyright_status="public_domain", full_text=PLAY_TEXT, text_format="plain", year_written=1879)
        self.db.add(self.play)
        self.db.flush()
        cand = scene_cutter.cut_play(PLAY_TEXT)[0]
        self.pd = ShelfScene(kind="public_domain", status="live", work_title="A Doll's House", author="Henrik Ibsen",
                             play_id=self.play.id, start_offset=cand.start, end_offset=cand.end,
                             text_hash=scene_cutter.span_hash(PLAY_TEXT, cand.start, cand.end),
                             title="Nora waits", character_1_name="Nora", character_2_name="Helmer",
                             character_1_gender="female", character_2_gender="male",
                             character_1_age_range="30s", character_2_age_range="30s",
                             duration_seconds=cand.duration_seconds, line_count=cand.turns, tone="tense", era="modern")
        self.db.add(self.pd)
        self.db.commit()
        # Plus unless a test says otherwise; the free shelf has its own test.
        self.whole_library = True
        patcher = mock.patch.object(api, "has_whole_library", lambda db, user: self.whole_library)
        patcher.start()
        self.addCleanup(patcher.stop)

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _my_upload(self, user=None):
        user = user or self.me
        stub = Play(title="Up", author="Me", genre="drama", category="contemporary", copyright_status="user_uploaded")
        self.db.add(stub)
        self.db.flush()
        script = UserScript(user_id=user.id, title="Doubt", author="J", original_filename="doubt.pdf", file_type="pdf")
        self.db.add(script)
        self.db.flush()
        scene = Scene(play_id=stub.id, user_script_id=script.id, title="The garden", character_1_name="Aloysius",
                      character_2_name="Flynn", character_1_gender="female", character_2_gender="male",
                      line_count=30, estimated_duration_seconds=240, tone="tense")
        self.db.add(scene)
        self.db.commit()
        return scene

    def _list(self, **kw):
        args = dict(pairing=None, age=None, length=None, tone=None, era=None, kind=None, q=None, offset=0, limit=30)
        args.update(kw)
        return api.list_shelf(current_user=self.me, db=self.db, **args)

    def test_browse_and_filter(self):
        self.assertEqual(self._list()["total"], 1)
        self.assertEqual(self._list(pairing="mf")["total"], 1)
        self.assertEqual(self._list(pairing="ff")["total"], 0)
        self.assertEqual(self._list(tone="comedic")["total"], 0)
        self.assertEqual(self._list(q="doll")["total"], 1)
        self.pd.status = "hidden"
        self.db.commit()
        self.assertEqual(self._list()["total"], 0)

    def test_rehearse_copies_the_lines_once(self):
        first = api.rehearse(self.pd.id, current_user=self.me, db=self.db)
        scene = self.db.query(Scene).get(first["scene_id"])
        self.assertEqual(scene.character_1_name, "Nora")
        # Its own play row: editing the copy can never rename the real play.
        self.assertNotEqual(scene.play_id, self.play.id)
        self.assertEqual(self.db.query(Play).get(scene.play_id).copyright_status, "user_uploaded")
        lines = self.db.query(SceneLine).filter(SceneLine.scene_id == scene.id).count()
        self.assertEqual(lines, self.pd.line_count)
        again = api.rehearse(self.pd.id, current_user=self.me, db=self.db)
        self.assertEqual(again["scene_id"], first["scene_id"])
        self.assertEqual(self.pd.open_count, 1)

    def test_add_to_my_shelf_puts_one_copy_in_my_scripts(self):
        self.assertIsNone(self._list()["items"][0]["on_my_shelf"])
        first = api.add_to_my_shelf(self.pd.id, current_user=self.me, db=self.db)
        self.assertTrue(first["added"])
        script = self.db.query(UserScript).get(first["script_id"])
        self.assertEqual(script.user_id, self.me.id)
        self.assertEqual(script.genre, "drama")
        again = api.add_to_my_shelf(self.pd.id, current_user=self.me, db=self.db)
        self.assertFalse(again["added"])
        self.assertEqual(again["script_id"], first["script_id"])
        self.assertEqual(self.pd.open_count, 1)
        self.assertEqual(self._list()["items"][0]["on_my_shelf"], first["script_id"])
        # Only mine: another actor sees it as not on theirs.
        theirs = api.list_shelf(current_user=self.other, db=self.db, pairing=None, age=None, length=None,
                                tone=None, era=None, kind=None, q=None, offset=0, limit=30)
        self.assertIsNone(theirs["items"][0]["on_my_shelf"])

    def test_a_free_shelf_holds_one_classic(self):
        self.whole_library = False
        second = ShelfScene(kind="public_domain", status="live", work_title="A Doll's House", author="Henrik Ibsen",
                            play_id=self.play.id, start_offset=self.pd.start_offset, end_offset=self.pd.end_offset,
                            text_hash=self.pd.text_hash, title="Again", character_1_name="Nora",
                            character_2_name="Helmer", duration_seconds=60, line_count=self.pd.line_count)
        self.db.add(second)
        self.db.commit()
        self.assertEqual(self._list()["adds_left"], 1)
        api.add_to_my_shelf(self.pd.id, current_user=self.me, db=self.db)
        self.assertEqual(self._list()["adds_left"], 0)
        # The one they hold is still theirs to open.
        self.assertFalse(api.add_to_my_shelf(self.pd.id, current_user=self.me, db=self.db)["added"])
        for door in (api.add_to_my_shelf, api.rehearse):
            with self.assertRaises(HTTPException) as err:
                door(second.id, current_user=self.me, db=self.db)
            self.assertEqual(err.exception.status_code, 403)
            self.assertEqual(err.exception.detail["error"], "library_upgrade_required")
        self.whole_library = True
        self.assertIsNone(self._list()["adds_left"])
        self.assertTrue(api.add_to_my_shelf(second.id, current_user=self.me, db=self.db)["added"])

    def test_a_shared_scene_is_never_copied(self):
        scene = self._my_upload(self.other)
        out = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="Scene 5"), current_user=self.other, db=self.db)
        with self.assertRaises(HTTPException) as err:
            api.add_to_my_shelf(out["id"], current_user=self.me, db=self.db)
        self.assertEqual(err.exception.status_code, 400)

    def test_a_moved_text_is_refused(self):
        self.play.full_text = "changed " + PLAY_TEXT
        self.db.commit()
        with self.assertRaises(HTTPException) as err:
            api.rehearse(self.pd.id, current_user=self.me, db=self.db)
        self.assertEqual(err.exception.status_code, 409)

    def test_share_a_pointer_not_the_text(self):
        scene = self._my_upload()
        out = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="Scene 5, the garden",
                                    show_name=True), current_user=self.me, db=self.db)
        self.assertEqual(out["kind"], "shared")
        self.assertEqual(out["shared_by"], "Maya")
        self.assertEqual(out["characters"][0]["gender"], "female")
        row = self.db.query(ShelfScene).get(out["id"])
        self.assertIsNone(row.play_id)
        self.assertIsNone(row.start_offset)
        # Sharing twice gives back the same row.
        again = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="x"), current_user=self.me, db=self.db)
        self.assertEqual(again["id"], out["id"])
        self.assertTrue(api.shareable(current_user=self.me, db=self.db)["items"][0]["already_shared"])
        self.assertTrue(api.mine(current_user=self.me, db=self.db)["contributor"])

    def test_cannot_share_someone_elses_scene(self):
        scene = self._my_upload(self.other)
        with self.assertRaises(HTTPException) as err:
            api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="x"), current_user=self.me, db=self.db)
        self.assertEqual(err.exception.status_code, 404)

    def test_a_shared_scene_asks_for_your_own_copy(self):
        scene = self._my_upload()
        out = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="Scene 5"), current_user=self.me, db=self.db)
        self.assertIsNone(out["shared_by"])  # no name unless they said yes
        theirs = api.rehearse(out["id"], current_user=self.other, db=self.db)
        self.assertTrue(theirs["bring_your_own"])
        self.assertIsNone(theirs["scene_id"])
        mine = api.rehearse(out["id"], current_user=self.me, db=self.db)
        self.assertEqual(mine["scene_id"], scene.id)
        self.assertEqual(api.mine(current_user=self.me, db=self.db)["opens"], 1)

    def test_only_moderators_hide(self):
        with self.assertRaises(HTTPException):
            api.set_status(self.pd.id, api.StatusIn(status="hidden"), current_user=self.me, db=self.db)
        api.set_status(self.pd.id, api.StatusIn(status="hidden"), current_user=self.mod, db=self.db)
        self.assertEqual(self.pd.status, "hidden")

    def test_withdraw_only_your_own(self):
        scene = self._my_upload()
        out = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="x"), current_user=self.me, db=self.db)
        with self.assertRaises(HTTPException):
            api.withdraw(out["id"], current_user=self.other, db=self.db)
        api.withdraw(out["id"], current_user=self.me, db=self.db)
        # Off the shelf, and the row stays to say "don't ask about this one again".
        self.assertEqual(self._list(kind="shared")["total"], 0)
        self.assertEqual(self._shareable()[0]["ask"], "done_asking")
        self.assertFalse(api.mine(current_user=self.me, db=self.db)["contributor"])

    def _shareable(self, script_id=None):
        return api.shareable(script_id=script_id, current_user=self.me, db=self.db)["items"]

    def test_not_now_is_remembered_and_asks_once_more_at_most(self):
        scene = self._my_upload()
        self.assertIsNone(self._shareable()[0]["ask"])
        self.assertEqual(self._shareable()[0]["where_guess"], "")
        out = api.decline(api.DeclineIn(scene_ids=[scene.id]), current_user=self.me, db=self.db)
        self.assertEqual(out["asks"][scene.id], "declined")
        self.assertEqual(self._shareable()[0]["ask"], "declined")
        # A no is never on the shelf and makes nobody a contributor.
        self.assertEqual(self._list(kind="shared")["total"], 0)
        self.assertFalse(api.mine(current_user=self.me, db=self.db)["contributor"])
        api.decline(api.DeclineIn(scene_ids=[scene.id]), current_user=self.me, db=self.db)
        self.assertEqual(self._shareable()[0]["ask"], "done_asking")
        # And a later yes still goes up, on the same row.
        shared = api.share(api.ShareIn(scene_id=scene.id, work_title="Doubt", where="Scene 5"), current_user=self.me, db=self.db)
        self.assertEqual(self.db.query(ShelfScene).filter(ShelfScene.source_scene_id == scene.id).count(), 1)
        self.assertEqual(shared["status"], "live")
        self.assertEqual(shared["where"], "Scene 5")
        self.assertEqual(self._shareable()[0]["ask"], "shared")
        # Declining a scene on the shelf leaves it there.
        api.decline(api.DeclineIn(scene_ids=[scene.id]), current_user=self.me, db=self.db)
        self.assertEqual(self._list(kind="shared")["total"], 1)

    def test_cannot_decline_someone_elses_scene(self):
        scene = self._my_upload(self.other)
        with self.assertRaises(HTTPException):
            api.decline(api.DeclineIn(scene_ids=[scene.id]), current_user=self.me, db=self.db)

    def test_a_declined_row_cannot_be_opened_or_unhidden(self):
        scene = self._my_upload()
        api.decline(api.DeclineIn(scene_ids=[scene.id]), current_user=self.me, db=self.db)
        row = self.db.query(ShelfScene).filter(ShelfScene.source_scene_id == scene.id).one()
        with self.assertRaises(HTTPException):
            api.rehearse(row.id, current_user=self.other, db=self.db)
        with self.assertRaises(HTTPException):
            api.set_status(row.id, api.StatusIn(status="live"), current_user=self.mod, db=self.db)

    def test_shareable_by_script_with_where_and_finished(self):
        scene = self._my_upload()
        scene.act, scene.scene_number = "Act 2", "Scene 3"
        self.db.commit()
        item = self._shareable(script_id=scene.user_script_id)[0]
        self.assertEqual(item["where_guess"], "Act 2, Scene 3")
        scene.act, scene.scene_number = "3", "1"
        self.db.commit()
        self.assertEqual(self._shareable()[0]["where_guess"], "Act 3, Scene 1")
        scene.act, scene.scene_number = "Episode 6: Passion", None
        self.db.commit()
        self.assertEqual(self._shareable()[0]["where_guess"], "Episode 6: Passion")
        self.assertEqual(item["script_title"], "Doubt")
        self.assertFalse(item["finished"])
        self.assertEqual(self._shareable(script_id=scene.user_script_id + 99), [])
        run = RehearsalRun(user_id=self.me.id, scene_id=scene.id, character="Flynn", voices={})
        self.db.add(run)
        self.db.flush()
        self.db.add(RehearsalEvent(run_id=run.id, seq=1, type="completed", at_ms=1000, payload={}))
        self.db.commit()
        self.assertTrue(self._shareable()[0]["finished"])


if __name__ == "__main__":
    unittest.main()
