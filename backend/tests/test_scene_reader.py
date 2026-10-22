"""The model reads each scene, and only a reading the page bears out is kept.

check_reading is the whole of the trust placed in what a model returns, so
most of this file is about it: a dropped "Stop it.", a line given to the wrong
person, a word changed, a direction that lost a name, a "(beat)" left in the
words. Then the shape that reaches rehearsal (directions ride on the line they
come before), the retry, the fallback to the rule parser, and the wiring into
extract_scenes_whole. Nothing here calls a model: _call_model is patched, and
conftest refuses it for every other test.
"""

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services import scene_reader
from app.services.scene_map import detect_scene_spans
from app.services.scene_reader import (
    check_reading,
    items_to_lines,
    normalise,
    read_scene,
    read_scenes,
)
from app.services.script_parser import (
    ScriptParser,
    _preprocess_text,
    _strip_production_marks,
    whole_scenes,
)

FIXTURES = Path(__file__).parent / "fixtures" / "scene_reader"
EXPECTED = json.loads((FIXTURES / "expected.json").read_text())


def _scene(name):
    raw = (FIXTURES / f"{name}.txt").read_text()
    spans = detect_scene_spans(_preprocess_text(_strip_production_marks(raw)))
    return whole_scenes(spans)[0]


def _items(name):
    return [dict(i) for i in EXPECTED[name]]


def _index(items, text):
    return next(k for k, i in enumerate(items) if i["text"] == text)


class TheHandReadingsPass(unittest.TestCase):
    """Every fixture's hand reading is grounded. If one ever fails, the check is wrong."""

    def test_each_fixture(self):
        for name in EXPECTED:
            with self.subTest(name):
                scene = _scene(name)
                self.assertEqual(check_reading(scene["_source_text"], _items(name)), [])


class TheTherapistScene(unittest.TestCase):
    """User script 132, the scene that started this."""

    def setUp(self):
        self.source = _scene("almost_a_therapist")["_source_text"]
        self.items = _items("almost_a_therapist")

    def test_dropping_stop_it_is_caught(self):
        k = _index(self.items, "Stop it.")
        problems = check_reading(self.source, self.items[:k] + self.items[k + 1:])
        self.assertTrue(any("Stop it" in p and "left out" in p for p in problems), problems)

    def test_mark_s_routine_given_to_esther_is_caught(self):
        k = next(i for i, it in enumerate(self.items) if it["delivery"] == "continuing his act")
        self.items[k]["character"] = "ESTHER"
        problems = check_reading(self.source, self.items)
        self.assertTrue(any("cued MARK" in p and "given to ESTHER" in p for p in problems), problems)

    def test_a_changed_word_is_caught(self):
        k = _index(self.items, "Breaks my heart really.")
        self.items[k]["text"] = "It breaks my heart really."
        problems = check_reading(self.source, self.items)
        self.assertTrue(any("word for word" in p for p in problems), problems)

    def test_a_delivery_that_is_not_on_the_page_is_caught(self):
        k = _index(self.items, "Stop it.")
        self.items[k]["delivery"] = "angrily"
        problems = check_reading(self.source, self.items)
        self.assertTrue(any("delivery" in p for p in problems), problems)

    def test_out_of_order_is_caught(self):
        a, b = _index(self.items, "Stop."), _index(self.items, "What?")
        self.items[a], self.items[b] = self.items[b], self.items[a]
        self.assertTrue(check_reading(self.source, self.items))

    def test_a_speaker_nobody_cues_is_caught(self):
        k = _index(self.items, "Maybe.")
        self.items[k]["character"] = "BUSTER"
        problems = check_reading(self.source, self.items)
        self.assertTrue(any("BUSTER" in p for p in problems), problems)

    def test_continued_speech_with_no_cue_keeps_its_speaker(self):
        k = next(i for i, it in enumerate(self.items) if "Being you is a dream" in it["text"])
        split = self.items[k]["text"].index("What I really")
        head, tail = self.items[k]["text"][:split].strip(), self.items[k]["text"][split:]
        self.items[k]["text"] = head
        self.items.insert(k + 1, {"kind": "line", "character": "ESTHER", "text": tail, "delivery": ""})
        problems = check_reading(self.source, self.items)
        self.assertTrue(any("no cue" in p for p in problems), problems)


class Typography(unittest.TestCase):
    """Quote marks, dashes and ellipses are not words."""

    SOURCE = "MARK: “You know what I hate – people,” he said… Fine.\nESTHER: Don’t."

    def items(self, mark, esther):
        return [
            {"kind": "line", "character": "MARK", "text": mark, "delivery": ""},
            {"kind": "line", "character": "ESTHER", "text": esther, "delivery": ""},
        ]

    def test_straight_quotes_and_hyphens_pass(self):
        self.assertEqual(
            check_reading(self.SOURCE, self.items('"You know what I hate - people," he said... Fine.', "Don't.")),
            [],
        )

    def test_a_lost_closing_quote_passes(self):
        self.assertEqual(
            check_reading(self.SOURCE, self.items("You know what I hate – people, he said… Fine.", "Don’t.")),
            [],
        )

    def test_normalise_keeps_the_words(self):
        self.assertEqual(normalise("it … hit—out"), "it ... hit - out")


class Directions(unittest.TestCase):

    def test_a_beat_left_in_the_words_is_caught(self):
        source = "THEO: I almost did. (beat) Then I didn't.\nMAYA: Oh."
        items = [
            {"kind": "line", "character": "THEO", "text": "I almost did. (beat) Then I didn't.", "delivery": ""},
            {"kind": "line", "character": "MAYA", "text": "Oh.", "delivery": ""},
        ]
        problems = check_reading(source, items)
        self.assertTrue(any("(beat)" in p for p in problems), problems)

    def test_a_spoken_bracket_in_verse_is_not_a_direction(self):
        source = (
            "EGEUS\nTurned her obedience (which is due to me)\nTo stubborn harshness.\n"
            "THESEUS\nWhat say you, Hermia?"
        )
        items = [
            {"kind": "line", "character": "EGEUS",
             "text": "Turned her obedience (which is due to me) To stubborn harshness.", "delivery": ""},
            {"kind": "line", "character": "THESEUS", "text": "What say you, Hermia?", "delivery": ""},
        ]
        self.assertEqual(check_reading(source, items), [])

    def test_a_direction_that_lost_a_name_is_caught(self):
        scene = _scene("diner_screenplay")
        items = _items("diner_screenplay")
        items[0]["text"] = items[0]["text"].replace("JUNE (40s) ", "(40s) ")
        problems = check_reading(scene["_source_text"], items)
        self.assertTrue(problems, "a name dropped from the action should not pass as a cue")

    def test_a_name_inside_action_is_no_cue(self):
        # gpt-5.4-mini, 2026-10-23: the action read as June speaking, "(40s)"
        # as her delivery. Every word was on the page; the cue was not.
        scene = _scene("diner_screenplay")
        items = _items("diner_screenplay")
        items[0:1] = [
            {"kind": "direction", "character": "", "text": "Rain against the window.", "delivery": ""},
            {"kind": "line", "character": "JUNE", "delivery": "40s",
             "text": "stirs a coffee she has no intention of drinking."},
            {"kind": "line", "character": "LEO", "delivery": "30s",
             "text": "slides into the booth across from her."},
        ]
        problems = check_reading(scene["_source_text"], items)
        self.assertTrue(any("JUNE" in p for p in problems), problems)

    def test_cont_d_is_no_delivery(self):
        items = [{"kind": "line", "character": "LEO", "text": "When?", "delivery": "CONT'D"}]
        self.assertIsNone(items_to_lines(items)[0]["stage_direction"])

    def test_a_split_direction_shows_the_name_was_kept(self):
        scene = _scene("diner_screenplay")
        items = _items("diner_screenplay")
        head, _, tail = items[0]["text"].partition(" JUNE")
        items[0:1] = [
            {"kind": "direction", "character": "", "text": head, "delivery": ""},
            {"kind": "direction", "character": "", "text": "JUNE" + tail, "delivery": ""},
        ]
        self.assertEqual(check_reading(scene["_source_text"], items), [])

    def test_a_trailing_dropped_direction_is_caught(self):
        scene = _scene("hamlet_nunnery")
        problems = check_reading(scene["_source_text"], _items("hamlet_nunnery")[:-1])
        self.assertTrue(any("after the last item" in p for p in problems), problems)


class IntoLines(unittest.TestCase):
    """What lands in scene_lines: spoken lines only, directions riding on them."""

    def test_a_direction_rides_on_the_line_after_it(self):
        lines = items_to_lines(_items("almost_a_therapist"))
        esther = next(l for l in lines if l["text"] == "Breaks my heart really.")
        self.assertEqual(esther["stage_direction"], "They stop walking.")
        mark = next(l for l in lines if l["text"] == "Oh honey … I’m so sorry.")
        self.assertIsNone(mark["stage_direction"])

    def test_a_direction_before_a_note_goes_first(self):
        items = [
            {"kind": "direction", "character": "", "text": "Mark continues with his act.", "delivery": ""},
            {"kind": "line", "character": "MARK", "text": "“Then…”", "delivery": "continuing his act"},
        ]
        self.assertEqual(
            items_to_lines(items)[0]["stage_direction"],
            "Mark continues with his act.; continuing his act",
        )

    def test_the_last_direction_closes_the_scene(self):
        lines = items_to_lines(_items("hamlet_nunnery"))
        self.assertEqual(lines[-1]["character"], "OPHELIA")
        # Hamlet's exit comes before Ophelia's speech, so it rides on it; the
        # entrance after her has no line to go above and closes the scene.
        self.assertEqual(lines[-1]["stage_direction"], "Exit.; Enter King and Polonius.")

    def test_no_direction_is_ever_spoken(self):
        for name in EXPECTED:
            lines = items_to_lines(_items(name))
            directions = [i["text"] for i in EXPECTED[name] if i["kind"] == "direction"]
            for line in lines:
                for d in directions:
                    if len(d) > 5:
                        self.assertNotIn(d, line["text"])

    def test_brackets_come_off_a_note(self):
        items = [{"kind": "direction", "character": "", "text": "(beat)", "delivery": ""},
                 {"kind": "line", "character": "theo", "text": "Not yet.", "delivery": ""}]
        self.assertEqual(items_to_lines(items), [
            {"character": "THEO", "text": "Not yet.", "stage_direction": "beat"},
        ])


def _reply(items, characters=()):
    return ({"items": items, "characters": list(characters)}, {"input": 1000, "output": 500})


class ReadScene(unittest.TestCase):

    def setUp(self):
        scene = _scene("ring_sides")
        self.source, self.hint = scene["_source_text"], scene["lines"]

    def test_a_grounded_reading_is_used(self):
        with patch.object(scene_reader, "_call_model", return_value=_reply(_items("ring_sides"))) as call:
            result = read_scene(self.source, self.hint, client=object(), model="m")
        self.assertFalse(result["flagged"])
        self.assertEqual(result["attempts"], 1)
        self.assertEqual(result["lines"], items_to_lines(_items("ring_sides")))
        self.assertEqual(call.call_count, 1)

    def test_a_bad_reading_is_sent_back_once_with_its_problems(self):
        bad = _items("ring_sides")
        bad[1]["text"] = "Of course I kept it, Maya."
        with patch.object(scene_reader, "_call_model",
                          side_effect=[_reply(bad), _reply(_items("ring_sides"))]) as call:
            result = read_scene(self.source, self.hint, client=object(), model="m")
        self.assertFalse(result["flagged"])
        self.assertEqual(result["attempts"], 2)
        retry = call.call_args_list[1].args[2]
        self.assertEqual(retry[-2]["role"], "assistant")
        self.assertIn("word for word", retry[-1]["content"])

    def test_two_bad_readings_keep_the_rules_and_flag_the_scene(self):
        bad = _items("ring_sides")[:-1]
        with patch.object(scene_reader, "_call_model", side_effect=[_reply(bad), _reply(bad)]) as call:
            result = read_scene(self.source, self.hint, client=object(), model="m",)
        self.assertEqual(call.call_count, 2)
        self.assertTrue(result["flagged"])
        self.assertTrue(result["problems"])
        self.assertEqual(result["lines"], self.hint)
        self.assertEqual(result["rejected"], bad)

    def test_a_failed_call_keeps_the_rules(self):
        with patch.object(scene_reader, "_call_model", side_effect=TimeoutError("slow")):
            result = read_scene(self.source, self.hint, client=object(), model="m")
        self.assertTrue(result["flagged"])
        self.assertEqual(result["lines"], self.hint)
        self.assertIn("TimeoutError", result["problems"][0])

    def test_tests_never_reach_the_model(self):
        # conftest's guard, not a patch here: the reader falls back quietly.
        result = read_scene(self.source, self.hint, client=object(), model="m")
        self.assertTrue(result["flagged"])
        self.assertIn("tests may not call", result["problems"][0])

    def test_no_client_and_a_scene_too_long(self):
        self.assertTrue(read_scene(self.source, self.hint, client=None)["flagged"])
        with patch.object(scene_reader, "MAX_SCENE_CHARS", 10):
            result = read_scene(self.source, self.hint, client=object())
        self.assertTrue(result["flagged"])
        self.assertIn("longer", result["problems"][0])


class ReadScenes(unittest.TestCase):

    def test_a_reading_replaces_the_lines_and_is_recorded(self):
        scene = _scene("almost_a_therapist")
        characters = [{"name": "MARK", "gender": "male", "age_range": "", "relationship": "Esther's friend",
                       "wants": "a laugh", "temperament": "restless"}]
        with patch.object(scene_reader, "_call_model",
                          return_value=_reply(_items("almost_a_therapist"), characters)):
            [out] = read_scenes([scene], client=object(), model="m")
        self.assertEqual(out["lines"], items_to_lines(_items("almost_a_therapist")))
        self.assertEqual(out["reading"]["flagged"], False)
        self.assertEqual(out["reading"]["characters"], characters)
        self.assertEqual(out["reading"]["items"], _items("almost_a_therapist"))
        self.assertEqual({out["character_1"], out["character_2"]}, {"MARK", "ESTHER"})

    def test_a_flagged_scene_keeps_its_lines(self):
        scene = _scene("almost_a_therapist")
        before = [dict(l) for l in scene["lines"]]
        [out] = read_scenes([scene], client=object(), model="m")  # conftest refuses the call
        self.assertEqual(out["lines"], before)
        self.assertTrue(out["reading"]["flagged"])

    def test_a_cancelled_upload_reads_nothing(self):
        import threading

        cancel = threading.Event()
        cancel.set()
        scene = _scene("ring_sides")
        with patch.object(scene_reader, "_call_model") as call:
            read_scenes([scene], client=object(), model="m", cancel_event=cancel)
        call.assert_not_called()
        self.assertNotIn("reading", scene)


class EveryUploadIsRead(unittest.TestCase):
    """parse_script, the one door every upload path goes through, uses the reader."""

    def test_parse_script_stores_the_reading(self):
        text = (FIXTURES / "almost_a_therapist.txt").read_text()
        parser = ScriptParser()
        meta = {"title": "Almost a Therapist", "author": "", "characters": []}
        with patch.object(ScriptParser, "extract_script_metadata", return_value=meta), \
             patch.object(ScriptParser, "analyze_scenes_batch", return_value=[{}]), \
             patch.object(scene_reader, "_call_model",
                          return_value=_reply(_items("almost_a_therapist"))):
            result = parser.parse_script(text.encode(), "txt", "almost.txt")
        [scene] = result["scenes"]
        self.assertNotIn("_source_text", scene)
        self.assertFalse(scene["reading"]["flagged"])
        stop_it = [l for l in scene["lines"] if l["text"] == "Stop it."]
        self.assertEqual([l["character"] for l in stop_it], ["ESTHER"])
        routine = next(l for l in scene["lines"] if l["text"].startswith("“Then the other afternoon"))
        self.assertEqual((routine["character"], routine["stage_direction"]), ("MARK", "continuing his act"))
        self.assertEqual(scene["lines"][-1]["text"], "I said no.")


if __name__ == "__main__":
    unittest.main()
