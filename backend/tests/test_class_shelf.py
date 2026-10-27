"""The class shelf: a teacher's scripts, seen by their class and nobody else."""

import asyncio
import unittest
from datetime import datetime, timedelta, timezone

import app.models  # noqa: F401  every mapper the relationships name
from fastapi import HTTPException

from app.api import class_shelf as api
from app.api import rehearsal as rehearsal_api
from app.api import scenes as scenes_api
from app.models.actor import FilmTvReference, Play, Scene, SceneFavorite, SceneLine, UserScript
from app.models.billing import UserBenefitOverride
from app.models.class_link import ClassLink, ClassLinkJoin
from app.models.organization import Organization
from app.models.user import User
from app.services import class_shelf, reading_budget
from tests.dbfixture import memory_db, restore


class ClassShelfTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, FilmTvReference, Play, UserScript, Scene, SceneLine, SceneFavorite,
                                         ClassLink, ClassLinkJoin, UserBenefitOverride])
        now = datetime.now(timezone.utc)
        mk = lambda email, **kw: User(email=email, hashed_password="x", created_at=now, **kw)  # noqa: E731
        self.teacher = mk("chris@workshop.com", name="Chris Cardona", account_type="educator")
        self.student = mk("s@gmail.com", name="Sam")
        self.outsider = mk("o@gmail.com", name="Olly")
        self.turned_away = mk("f@gmail.com", name="Fay")
        self.mod = mk("m@actorrise.com", is_moderator=True)
        self.db.add_all([self.teacher, self.student, self.outsider, self.turned_away, self.mod])
        self.db.flush()
        self.link = ClassLink(code="actorsworkshop-chris", teacher_user_id=self.teacher.id,
                              teacher_label="Chris", active=True)
        self.db.add(self.link)
        self.db.flush()
        self.db.add_all([
            ClassLinkJoin(class_link_id=self.link.id, user_id=self.student.id, outcome="granted"),
            ClassLinkJoin(class_link_id=self.link.id, user_id=self.turned_away.id, outcome="full"),
        ])
        self.script, self.scene = self._script(self.teacher, "Diner, night")
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _script(self, owner, title):
        script = UserScript(user_id=owner.id, title=title, author="Unknown", original_filename=f"{title}.txt",
                            file_type="txt", processing_status="completed", characters=[])
        play = Play(title=title, author="Unknown", genre="drama", category="contemporary",
                    copyright_status="user_uploaded", full_text="x", text_format="plain")
        self.db.add_all([script, play])
        self.db.flush()
        scene = Scene(play_id=play.id, user_script_id=script.id, title=title, character_1_name="MARK",
                      character_2_name="SARAH", line_count=2, estimated_duration_seconds=30)
        self.db.add(scene)
        self.db.flush()
        self.db.add_all([
            SceneLine(scene_id=scene.id, line_order=0, character_name="MARK", text="Go home.", word_count=2),
            SceneLine(scene_id=scene.id, line_order=1, character_name="SARAH", text="No.", word_count=1),
        ])
        return script, scene

    def _share(self, on=True):
        return api.share_script(self.script.id, api.ShareIn(on=on), current_user=self.teacher, db=self.db)

    def _detail(self, user):
        return asyncio.run(scenes_api.get_scene_detail(self.scene.id, db=self.db, current_user=user))

    def _not_found(self, fn):
        with self.assertRaises(HTTPException) as cm:
            fn()
        self.assertEqual(cm.exception.status_code, 404)

    # --- the student ---------------------------------------------------------

    def test_a_student_sees_the_shared_script_under_the_teachers_name(self):
        self._share()
        shelves = api.read_class_shelves(current_user=self.student, db=self.db)["shelves"]
        self.assertEqual(len(shelves), 1)
        self.assertEqual(shelves[0]["teacher"], "Chris")
        self.assertEqual([s["title"] for s in shelves[0]["scripts"]], ["Diner, night"])
        self.assertEqual(shelves[0]["scripts"][0]["scenes"][0]["id"], self.scene.id)

    def test_a_student_opens_and_rehearses_it_read_only(self):
        self._share()
        detail = self._detail(self.student)
        self.assertEqual([l.text for l in detail.lines], ["Go home.", "No."])
        self.assertFalse(detail.can_edit)
        scene, script = rehearsal_api._load_scene(self.db, self.scene.id, self.student)
        self.assertEqual(script.id, self.script.id)
        self.assertTrue(self._detail(self.teacher).can_edit)

    def test_a_student_in_two_classes_sees_both_shelves(self):
        self._share()
        other = User(email="t2@school.edu", hashed_password="x", name="Dana", account_type="educator",
                     created_at=datetime.now(timezone.utc))
        self.db.add(other)
        self.db.flush()
        link2 = ClassLink(code="gilroy-dana", teacher_user_id=other.id, teacher_label="Dana", active=True)
        self.db.add(link2)
        self.db.flush()
        self.db.add(ClassLinkJoin(class_link_id=link2.id, user_id=self.student.id, outcome="paying"))
        script2, _ = self._script(other, "Courtroom")
        script2.class_share = "live"
        self.db.commit()
        shelves = api.read_class_shelves(current_user=self.student, db=self.db)["shelves"]
        self.assertEqual([s["teacher"] for s in shelves], ["Chris", "Dana"])

    # --- nobody else ---------------------------------------------------------

    def test_a_non_member_cannot_see_or_open_it(self):
        self._share()
        for user in (self.outsider, self.turned_away):
            self.assertEqual(api.read_class_shelves(current_user=user, db=self.db)["shelves"], [])
            self._not_found(lambda: self._detail(user))
            self._not_found(lambda: rehearsal_api._load_scene(self.db, self.scene.id, user))

    def test_an_unshared_upload_was_never_readable_by_id(self):
        # The leak this closed: GET /api/scenes/{id} read anyone's scene.
        self._not_found(lambda: self._detail(self.outsider))
        self._not_found(lambda: self._detail(self.student))

    def test_turning_the_switch_off_hides_it(self):
        self._share()
        self._share(on=False)
        self.assertIsNone(self.db.get(UserScript, self.script.id).class_share)
        self.assertEqual(api.read_class_shelves(current_user=self.student, db=self.db)["shelves"], [])
        self._not_found(lambda: self._detail(self.student))
        self._not_found(lambda: rehearsal_api._load_scene(self.db, self.scene.id, self.student))

    def test_switching_the_link_off_takes_the_shelf_down(self):
        self._share()
        self.link.active = False
        self.db.commit()
        self.assertEqual(api.read_class_shelves(current_user=self.student, db=self.db)["shelves"], [])
        self._not_found(lambda: self._detail(self.student))

    def test_a_moderator_takedown_holds_against_the_teacher(self):
        self._share()
        api.moderate_script(self.script.id, api.StatusIn(status="hidden"), current_user=self.mod, db=self.db)
        self.assertEqual(api.read_class_shelves(current_user=self.student, db=self.db)["shelves"], [])
        with self.assertRaises(HTTPException) as cm:
            self._share()
        self.assertEqual(cm.exception.status_code, 403)
        with self.assertRaises(HTTPException) as cm:
            api.moderate_script(self.script.id, api.StatusIn(status="hidden"), current_user=self.teacher, db=self.db)
        self.assertEqual(cm.exception.status_code, 403)

    # --- the teacher ---------------------------------------------------------

    def test_only_a_teacher_with_a_link_may_share_and_only_their_own(self):
        mine, _ = self._script(self.outsider, "Mine")
        self.db.commit()
        with self.assertRaises(HTTPException) as cm:
            api.share_script(mine.id, api.ShareIn(on=True), current_user=self.outsider, db=self.db)
        self.assertEqual(cm.exception.status_code, 403)
        self._not_found(lambda: api.share_script(mine.id, api.ShareIn(on=True), current_user=self.teacher, db=self.db))

    def test_bulk_share_and_the_count_on_the_teachers_card(self):
        second, _ = self._script(self.teacher, "Kitchen")
        stranger, _ = self._script(self.outsider, "Not his")
        self.db.commit()
        out = api.share_scripts(api.ShareIn(on=True, script_ids=[self.script.id, second.id, stranger.id]),
                                current_user=self.teacher, db=self.db)
        self.assertEqual(out, {"changed": 2, "shared": 2})
        self.assertIsNone(self.db.get(UserScript, stranger.id).class_share)
        mine = api.read_my_sharing(current_user=self.teacher, db=self.db)
        self.assertEqual((mine["can_share"], mine["shared"]), (True, 2))
        self.assertEqual(api.read_my_sharing(current_user=self.student, db=self.db)["can_share"], False)


class UploadsUnlockWithAClass(ClassShelfTests):
    def test_five_students_in_the_class_unlock_unlimited_uploads(self):
        # setUp has one member and one turned away ("full", not counted).
        self.assertEqual(class_shelf.students_joined(self.db, self.teacher), 1)
        self.assertFalse(class_shelf.uploads_unlocked(self.db, self.teacher))
        now = datetime.now(timezone.utc)
        for i in range(4):
            u = User(email=f"s{i}@x.com", hashed_password="x", created_at=now)
            self.db.add(u)
            self.db.flush()
            self.db.add(ClassLinkJoin(class_link_id=self.link.id, user_id=u.id, outcome="granted"))
        self.db.commit()
        self.assertEqual(class_shelf.students_joined(self.db, self.teacher), 5)
        self.assertTrue(class_shelf.uploads_unlocked(self.db, self.teacher))
        mine = api.read_my_sharing(current_user=self.teacher, db=self.db)
        self.assertEqual((mine["students"], mine["unlimited_uploads"]), (5, True))

    def test_only_a_teacher_unlocks(self):
        self.assertFalse(class_shelf.uploads_unlocked(self.db, self.student))


class ReadingAllowanceTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, UserBenefitOverride])
        self.user = User(email="c@x.com", hashed_password="x", created_at=datetime.now(timezone.utc))
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_an_override_raises_one_account_until_it_expires(self):
        default = reading_budget.SCENE_READS_PER_MONTH
        self.assertEqual(reading_budget.monthly_allowance(self.db, self.user.id), default)
        row = UserBenefitOverride(user_id=self.user.id, feature_key=reading_budget.OVERRIDE_KEY,
                                  override_type="set", value=700,
                                  expires_at=datetime.now(timezone.utc) + timedelta(days=5))
        self.db.add(row)
        self.db.commit()
        self.assertEqual(reading_budget.monthly_allowance(self.db, self.user.id), 700)
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        self.db.commit()
        self.assertEqual(reading_budget.monthly_allowance(self.db, self.user.id), default)


if __name__ == "__main__":
    unittest.main()
