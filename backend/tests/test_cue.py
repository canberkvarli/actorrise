"""Cue: the cap, the handoff, and the guard on prices and trial lengths.

The model is never called. `agent.call_model` is swapped for a script of turns,
so each test says exactly what "Claude" streamed and which tools it asked for,
and checks what the actor would have seen and what landed in the database.
"""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import mock

from app.models.cue import CueConversation, CueMessage
from app.models.feedback import ResultFeedback
from app.models.organization import Organization
from app.models.user import User
from app.services.cue import agent, caps, guard, tools
from tests.dbfixture import memory_db, restore


def text_turn(*chunks):
    final = SimpleNamespace(stop_reason="end_turn", content=[], usage=SimpleNamespace(input_tokens=100, output_tokens=20))
    return list(chunks), final


def tool_turn(name, args, tool_id="t1", chunks=()):
    block = SimpleNamespace(type="tool_use", id=tool_id, name=name, input=args)
    final = SimpleNamespace(stop_reason="tool_use", content=[block], usage=SimpleNamespace(input_tokens=100, output_tokens=20))
    return list(chunks), final


class ScriptedModel:
    """Stands in for agent.call_model: one scripted turn per call."""

    def __init__(self, turns):
        self.turns = list(turns)
        self.calls = 0

    def __call__(self, client, **kwargs):
        self.calls += 1
        chunks, final = self.turns.pop(0)
        for c in chunks:
            yield "text", c
        yield "final", final


class CueTestBase(unittest.TestCase):
    plus = False

    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, CueConversation, CueMessage, ResultFeedback])
        self.user = User(email="actor@gmail.com", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()
        self.patches = [
            mock.patch.object(tools, "is_plus", lambda db, user: self.plus),
            mock.patch.object(agent, "_email_handoff", lambda *a, **k: None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.db.close()
        restore(self.saved)

    def ask(self, text, turns):
        model = ScriptedModel(turns)
        with mock.patch.object(agent, "call_model", model):
            events = list(agent.respond(self.db, self.user, text, client=object()))
        shown = "".join(e["text"] for e in events if e["type"] == "text")
        return events, shown, model


class FreeCapTests(CueTestBase):
    def test_cap_blocks_message_11_for_a_free_user(self):
        with mock.patch.dict("os.environ", {"CUE_FREE_MONTHLY": "10"}):
            for i in range(10):
                events, shown, _ = self.ask(f"question {i}", [text_turn("Sure.")])
                self.assertEqual(events[-1]["type"], "done")
            events, shown, model = self.ask("question 11", [text_turn("Should never be said.")])
        self.assertEqual(events, [{"type": "capped", "reason": "free_cap", "limit": 10}])
        self.assertEqual(model.calls, 0, "the model must not be called past the cap")
        asked = self.db.query(CueMessage).filter(CueMessage.role == "user").count()
        self.assertEqual(asked, 10, "the refused message is not stored or counted")

    def test_default_free_allowance_is_monthly_15(self):
        for i in range(15):
            self.ask(f"q{i}", [text_turn("Ok.")])
        events, _, _ = self.ask("q16", [text_turn("No.")])
        self.assertEqual(events[0]["reason"], "free_cap")
        self.assertEqual(events[0]["limit"], 15)


class PlusTests(CueTestBase):
    plus = True

    def test_plus_is_not_held_to_the_free_allowance(self):
        for i in range(20):
            events, _, _ = self.ask(f"q{i}", [text_turn("Ok.")])
            self.assertEqual(events[-1]["type"], "done")

    def test_plus_abuse_guard_is_daily(self):
        with mock.patch.dict("os.environ", {"CUE_PLUS_DAILY": "3"}):
            for i in range(3):
                self.ask(f"q{i}", [text_turn("Ok.")])
            _, shown, model = self.ask("q4", [text_turn("No.")])
        self.assertEqual(shown, agent.PLUS_CAP)
        self.assertEqual(model.calls, 0)


class HandoffTests(CueTestBase):
    def feedback(self):
        return self.db.query(ResultFeedback).all()

    def test_handoff_writes_to_the_feedback_inbox(self):
        events, shown, _ = self.ask(
            "Can you get me a refund?",
            [
                tool_turn("hand_off", {"reason": "billing", "summary": "Wants a refund on Plus."}),
                text_turn("I've passed this to Canberk. He reads everything and will reply by email."),
            ],
        )
        rows = self.feedback()
        self.assertEqual(len(rows), 1)
        fb = rows[0]
        self.assertEqual(fb.context, "cue")
        self.assertEqual(fb.rating, "negative", "negative + comment is what the inbox lists")
        self.assertIn("Wants a refund on Plus.", fb.comment)
        self.assertIn("reason=billing", fb.comment)
        self.assertEqual(fb.user_id, self.user.id)
        conv = self.db.query(CueConversation).one()
        self.assertEqual(conv.handoff_reason, "billing")
        self.assertIsNotNone(conv.handoff_at)
        self.assertTrue(events[-1]["handed_off"])

    def test_teacher_reaches_canberk_even_if_the_model_forgets(self):
        self.ask("I teach a high school drama class, can my students use this?", [text_turn("Sounds great!")])
        rows = self.feedback()
        self.assertEqual(len(rows), 1)
        self.assertIn("reason=teacher", rows[0].comment)

    def test_ordinary_question_is_not_handed_off(self):
        self.ask("a funny monologue for a woman in her 20s", [text_turn("Here are a few.")])
        self.assertEqual(self.feedback(), [])

    def test_over_the_spend_ceiling_cue_rests_and_hands_off(self):
        with mock.patch.object(caps, "spend_today", lambda db, now=None: 5.0):
            _, shown, model = self.ask("how do I upload a script?", [text_turn("No.")])
        self.assertEqual(shown, agent.RESTING)
        self.assertEqual(model.calls, 0)
        self.assertIn("reason=resting", self.feedback()[0].comment)


class NumberGuardTests(CueTestBase):
    """Cue never quotes a price or trial length that didn't come from the server."""

    def test_trial_length_from_memory_is_replaced(self):
        _, shown, _ = self.ask("how long is the trial?", [text_turn("The trial is two weeks free. ", "Try it!")])
        self.assertNotIn("two weeks", shown)
        self.assertIn(guard.REPLACEMENT, shown)
        self.assertIn("Try it!", shown)

    def test_price_from_memory_is_replaced(self):
        _, shown, _ = self.ask("how much is plus?", [text_turn("Plus is $12 a month.")])
        self.assertNotIn("$12", shown)
        self.assertIn(guard.REPLACEMENT, shown)

    def test_trial_length_from_my_account_is_allowed(self):
        account = {"plan": "Free", "trial_days_if_started_now": 7}
        with mock.patch.object(tools, "run", lambda name, args, db, user: account):
            _, shown, _ = self.ask(
                "how long is my trial?",
                [tool_turn("my_account", {}), text_turn("Your free trial would be 7 days.")],
            )
        self.assertIn("7 days", shown)
        self.assertNotIn(guard.REPLACEMENT, shown)

    def test_server_said_7_days_so_two_weeks_is_still_blocked(self):
        account = {"plan": "Free", "trial_days_if_started_now": 7}
        with mock.patch.object(tools, "run", lambda name, args, db, user: account):
            _, shown, _ = self.ask(
                "how long is my trial?",
                [tool_turn("my_account", {}), text_turn("Your free trial is two weeks.")],
            )
        self.assertNotIn("two weeks", shown)

    def test_price_from_pricing_tool_is_allowed(self):
        plans = {"plans": [{"name": "Plus", "monthly_price_cents": 1200, "annual_price_cents": 9900}]}
        with mock.patch.object(tools, "run", lambda name, args, db, user: plans):
            _, shown, _ = self.ask(
                "how much is plus?",
                [tool_turn("pricing", {}), text_turn("Plus is $12 a month or $99 a year.")],
            )
        self.assertIn("$12", shown)
        self.assertIn("$99", shown)

    def test_numbers_from_search_results_cannot_vouch_for_a_trial(self):
        results = {"results": [{"id": 14, "title": "X", "minutes": 2.0, "link": "/monologue/14"}]}
        with mock.patch.object(tools, "run", lambda name, args, db, user: results):
            _, shown, _ = self.ask(
                "pieces?",
                [tool_turn("search_monologues", {"query": "x"}), text_turn("You get 14 days free on the trial.")],
            )
        self.assertIn(guard.REPLACEMENT, shown)

    def test_stored_reply_is_what_the_actor_saw(self):
        self.ask("price?", [text_turn("Plus is $12 a month.")])
        reply = self.db.query(CueMessage).filter(CueMessage.role == "assistant").one()
        self.assertNotIn("$12", reply.content)


class GuardUnitTests(unittest.TestCase):
    def test_rate_is_not_a_span(self):
        self.assertEqual(guard.check_sentence("Free accounts get 15 messages a month.", set()),
                         "Free accounts get 15 messages a month.")

    def test_sentence_gate_streams_whole_sentences(self):
        g = guard.SentenceGate()
        out = g.feed("Hello there. How")
        self.assertEqual(out, ["Hello there. "])
        out += g.feed(" are you?") + g.flush()
        self.assertEqual("".join(out), "Hello there. How are you?")


class PromptTests(unittest.TestCase):
    def test_prompt_and_facts_carry_no_numbers_or_dashes(self):
        import re

        text = agent.system_prompt()
        self.assertNotIn("{facts}", text)
        facts = (agent.HERE / "facts.md").read_text()
        self.assertIsNone(re.search(r"\$\s?\d", facts), "prices belong to the pricing tool, not the fact sheet")
        self.assertIsNone(re.search(r"\b\d+\s*(day|week)", facts), "trial length belongs to my_account")
        self.assertNotIn("—", facts)
        self.assertNotIn("–", facts)

    def test_backstop_reasons(self):
        self.assertEqual(agent.backstop_reason("I want a refund"), "billing")
        self.assertEqual(agent.backstop_reason("please delete my account"), "account")
        self.assertEqual(agent.backstop_reason("the mic is broken"), "bug")
        self.assertIsNone(agent.backstop_reason("I'm a student looking for Shakespeare"))


if __name__ == "__main__":
    unittest.main()
