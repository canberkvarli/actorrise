"""The audition file: bring checklist, notes after the room, callbacks, and the
AI help (a read on the scene, ask me), with the model faked."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.actor import UserScript
from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services.auditions import assist, core, parse
from tests.dbfixture import memory_db, restore

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)
STARTS = datetime(2026, 10, 14, 18, 40, tzinfo=timezone.utc)  # 2:40 pm in New York
TABLES = [Organization, User, UserScript, Audition, AuditionPiece, AuditionEvent, AuditionReminderSend, UserEvent]

def _llm(payload):
    calls = []

    def call(prompt):
        calls.append(prompt)
        return json.dumps(payload)

    call.calls = calls
    return call


class Base(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db(TABLES)
        self.user = User(email="a@x.com", supabase_id="a")
        self.db.add(self.user)
        self.db.commit()
        self.a = core.create_audition(self.db, self.user.id, {
            "project": "The Long Winter", "role": "Nora", "starts_at": STARTS, "tz": "America/New_York",
            "location": "Ripley Studios, 412 W 39th St, room 4", "bring": "headshot, resume and the sides",
        }, source="manual", now=NOW)

    def tearDown(self):
        restore(self.saved)


class BringListTests(Base):
    def test_the_email_line_becomes_a_checklist(self):
        out = core.serialize(self.db, self.a, NOW, with_prep=False)
        self.assertEqual([i["text"] for i in out["bring_list"]], ["Headshot", "Resume", "The sides"])
        self.assertTrue(all(i["src"] == "email" and not i["done"] for i in out["bring_list"]))

    def test_ticking_one_is_kept_and_cleaned(self):
        core.update_audition(self.db, self.a, {"bring_list": [
            {"text": " Headshot ", "done": True, "src": "email"},
            {"text": "headshot", "done": False},  # duplicate, dropped
            {"text": "", "done": False},  # empty, dropped
            {"text": "Layers", "src": "nonsense"},
        ]})
        self.assertEqual(self.a.bring_list, [
            {"text": "Headshot", "done": True, "src": "email"},
            {"text": "Layers", "done": False, "src": "me"},
        ])

    def test_a_new_bring_line_keeps_what_i_added(self):
        core.update_audition(self.db, self.a, {"bring_list": [
            {"text": "Headshot", "done": True, "src": "email"}, {"text": "Layers", "done": False, "src": "me"},
        ]})
        core.update_audition(self.db, self.a, {"bring": "two copies of the sides"})
        self.assertEqual([i["text"] for i in self.a.bring_list], ["Two copies of the sides", "Layers"])

    def test_a_bad_list_is_refused(self):
        with self.assertRaises(ValueError):
            core.update_audition(self.db, self.a, {"bring_list": "headshot"})


class DetailsTests(Base):
    def test_through_and_after_notes(self):
        core.update_audition(self.db, self.a, {
            "through": "Maya Chen, Bright Talent", "through_kind": "agent", "shoots": "Jan to Mar, SAG",
            "after_notes": {"how": " Felt good ", "room": "", "nonsense": "x"},
        })
        out = core.serialize(self.db, self.a, NOW, with_prep=False)
        self.assertEqual(out["through"], "Maya Chen, Bright Talent")
        self.assertEqual(out["through_kind"], "agent")
        self.assertEqual(out["after_notes"], {"how": "Felt good"})

    def test_through_kind_must_be_known(self):
        with self.assertRaises(ValueError):
            core.update_audition(self.db, self.a, {"through_kind": "cousin"})

    def test_reader_picks_up_who_sent_it(self):
        d = parse.normalize_draft({
            "project": {"value": "P", "confidence": "high"},
            "through": {"value": "Maya Chen, Bright Talent", "confidence": "high"},
            "through_kind": {"value": "agent", "confidence": "high"},
            "shoots": {"value": "Shoots Jan to Mar, SAG", "confidence": "low"},
        }, NOW, "UTC")
        self.assertEqual(d["through"]["value"], "Maya Chen, Bright Talent")
        self.assertEqual(d["through_kind"]["value"], "agent")
        self.assertEqual(d["shoots"], {"value": "Shoots Jan to Mar, SAG", "confidence": "low"})

    def test_reader_drops_an_unknown_through_kind(self):
        d = parse.normalize_draft({"through_kind": {"value": "friend", "confidence": "high"}}, NOW, "UTC")
        self.assertIsNone(d["through_kind"]["value"])


class CallbackTests(Base):
    def test_a_callback_is_its_own_audition_with_no_date(self):
        core.update_audition(self.db, self.a, {"through": "Maya Chen", "through_kind": "agent", "casting": "Jane Okafor"})
        cb = core.add_callback(self.db, self.a)
        self.assertNotEqual(cb.id, self.a.id)
        self.assertEqual((cb.project, cb.role, cb.casting, cb.through), ("The Long Winter", "Nora", "Jane Okafor", "Maya Chen"))
        self.assertEqual(cb.status, "callback")
        self.assertIsNone(cb.starts_at)
        self.assertEqual(self.a.status, "callback")
        self.assertEqual(core.serialize(self.db, self.a, NOW, with_prep=False)["callback_id"], cb.id)

    def test_a_removed_callback_frees_the_button(self):
        cb = core.add_callback(self.db, self.a)
        core.delete_audition(self.db, cb)
        self.assertIsNone(core.callback_of(self.db, self.a))


class ReadTests(Base):
    def _sides(self, text="NORA\nYou think I don't know what this winter costs?", status="completed"):
        s = UserScript(user_id=self.user.id, title="Long Winter sides", author="x", original_filename="s.pdf",
                       file_type="pdf", raw_text=text, processing_status=status)
        self.db.add(s)
        self.db.commit()
        core.update_audition(self.db, self.a, {"user_script_id": s.id})

    def test_read_from_the_sides_and_wear_goes_on_the_list(self):
        self._sides()
        llm = _llm({"read": "my read: she is angry at the numbers, not at Tom.", "wear": ["Layers", "headshot", "Flat boots"]})
        read = assist.read_scene(self.db, self.a, llm_call=llm)
        self.assertEqual(read["line"], "(my read: she is angry at the numbers, not at Tom.)")
        self.assertIn("You think I don't know", llm.calls[0])
        items = core.serialize(self.db, self.a, NOW, with_prep=False)["bring_list"]
        self.assertEqual([i["text"] for i in items], ["Headshot", "Resume", "The sides", "Layers", "Flat boots"])
        self.assertEqual(items[-1]["src"], "ai")

    def test_no_sides_means_wear_only(self):
        llm = _llm({"read": "(my read: invented)", "wear": ["Layers"]})
        read = assist.read_scene(self.db, self.a, llm_call=llm)
        self.assertIsNone(read["line"])
        self.assertIn("No sides yet.", llm.calls[0])

    def test_sides_still_loading_count_as_none(self):
        self._sides(status="processing")
        llm = _llm({"read": "x", "wear": []})
        self.assertIsNone(assist.read_scene(self.db, self.a, llm_call=llm)["line"])

    def test_read_is_made_once(self):
        self._sides()
        llm = _llm({"read": "(my read: x)", "wear": []})
        assist.read_scene(self.db, self.a, llm_call=llm)
        assist.read_scene(self.db, self.a, llm_call=llm)
        self.assertEqual(len(llm.calls), 1)

    def test_model_failure_means_no_read(self):
        def broken(prompt):
            raise TimeoutError("slow")

        self.assertIsNone(assist.read_scene(self.db, self.a, llm_call=broken))
        self.assertIsNone(core.serialize(self.db, self.a, NOW, with_prep=False)["assist"]["read"])


class AskTests(Base):
    def test_answer_is_kept_on_the_audition(self):
        llm = _llm({"answer": "Bring two copies – one for the reader."})
        entry = assist.ask(self.db, self.a, "how many copies?", NOW, llm_call=llm)
        self.assertEqual(entry["a"], "Bring two copies, one for the reader.")
        self.assertIn("Ripley Studios", llm.calls[0])
        asks = core.serialize(self.db, self.a, NOW, with_prep=False)["assist"]["asks"]
        self.assertEqual([x["q"] for x in asks], ["how many copies?"])

    def test_keeps_the_last_twenty(self):
        llm = _llm({"answer": "ok"})
        for i in range(assist.ASKS_KEPT + 3):
            assist.ask(self.db, self.a, f"q{i}", NOW, llm_call=llm)
        asks = self.a.assist["asks"]
        self.assertEqual(len(asks), assist.ASKS_KEPT)
        self.assertEqual(asks[-1]["q"], f"q{assist.ASKS_KEPT + 2}")

    def test_empty_answer_is_a_failure(self):
        self.assertIsNone(assist.ask(self.db, self.a, "anything?", NOW, llm_call=_llm({"answer": ""})))

    def test_quota_counts_this_month(self):
        for _ in range(3):
            self.db.add(UserEvent(user_id=self.user.id, event_name="audition_asked", properties={}, created_at=NOW))
        self.db.add(UserEvent(user_id=self.user.id, event_name="audition_asked", properties={},
                              created_at=NOW - timedelta(days=40)))
        self.db.commit()
        with mock.patch.object(parse, "_tier", lambda db, uid: "free"):
            q = assist.asks_quota(self.db, self.user.id, NOW)
        self.assertEqual((q["tier"], q["used"], q["remaining"]), ("free", 3, assist.ASKS_PER_MONTH["free"] - 3))


if __name__ == "__main__":
    unittest.main()


class AskVoiceAndForgetTests(Base):
    def test_the_prompt_never_lets_the_helper_speak_as_the_actor(self):
        llm = _llm({"answer": "I'm the helper on this page."})
        assist.ask(self.db, self.a, "who are you?", NOW, llm_call=llm)
        self.assertIn("You are not the actor", llm.calls[0])
        self.assertIn("The person asking IS the actor", llm.calls[0])

    def test_one_question_can_be_taken_off(self):
        first = assist.ask(self.db, self.a, "where do I park?", NOW, llm_call=_llm({"answer": "Street parking."}))
        assist.ask(self.db, self.a, "how long is it?", NOW + timedelta(minutes=1), llm_call=_llm({"answer": "Ten minutes."}))
        self.assertTrue(assist.forget_ask(self.db, self.a, first["at"]))
        self.assertEqual([x["q"] for x in core.public_assist(self.a.assist)["asks"]], ["how long is it?"])
        self.assertFalse(assist.forget_ask(self.db, self.a, first["at"]))


class RecentlyDeletedTests(Base):
    def test_a_removed_audition_comes_back_within_thirty_days(self):
        core.delete_audition(self.db, self.a, now=NOW)
        self.assertEqual(core.list_auditions(self.db, self.user.id, NOW), [])
        self.assertEqual([a.id for a in core.recently_deleted(self.db, self.user.id, NOW + timedelta(days=3))], [self.a.id])
        back = core.restore_audition(self.db, self.user.id, self.a.id, NOW + timedelta(days=3))
        self.assertIsNotNone(back)
        self.assertEqual([a.id for a in core.list_auditions(self.db, self.user.id, NOW)], [self.a.id])

    def test_after_thirty_days_it_is_gone_for_good(self):
        core.delete_audition(self.db, self.a, now=NOW)
        later = NOW + timedelta(days=31)
        self.assertEqual(core.recently_deleted(self.db, self.user.id, later), [])
        self.assertIsNone(core.restore_audition(self.db, self.user.id, self.a.id, later))


class ReminderMomentsTests(Base):
    def test_all_three_until_chosen(self):
        self.assertEqual(core.serialize(self.db, self.a, NOW, with_prep=False)["reminder_moments"], ["prep", "eve", "after"])

    def test_a_chosen_moment_is_the_only_one_sent(self):
        from app.services.auditions import reminders

        core.update_audition(self.db, self.a, {"reminder_moments": ["after", "eve"]})
        self.assertEqual(self.a.reminder_moments, ["eve", "after"])
        eve = reminders._at(self.a, -1, 19) + timedelta(minutes=5)
        prep = reminders._at(self.a, -3, 18) + timedelta(minutes=5)
        self.assertEqual(reminders.due_moments(self.a, eve), ["eve"])
        self.assertEqual(reminders.due_moments(self.a, prep), [])

    def test_a_moment_that_isnt_one_is_refused(self):
        with self.assertRaises(ValueError):
            core.update_audition(self.db, self.a, {"reminder_moments": ["lunch"]})
