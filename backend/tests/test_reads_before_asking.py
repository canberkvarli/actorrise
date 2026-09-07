"""A script with no act headings is still read off the page first.

Everything the whole-scene work fixed applied only to texts carrying ACT and
Scene headings. A side does not carry them, and a side is what an actor
actually uploads the week before an audition. So the most common upload in the
product was still going to gpt-4o-mini, which chooses which lines survive, with
a recovery guard that only ever restored the two busiest speakers.

Measured 2026-09-07 on the two headingless files in the repo: the deterministic
reader gets the sides right (10 speeches, 6 parts) and the pasted sample right
(11 speeches), and neither was being asked. The model was.

So the reader goes first on everything. It either finds a real exchange — two
or more speakers trading at least four lines — or it finds nothing, and only
then does the model get the text. The model still writes every title and
summary; it just never decides what was said.
"""

import unittest
from unittest.mock import patch

from app.services.script_parser import ScriptParser

# No ACT, no Scene, no slug lines. What a side or a pasted scene looks like.
SIDE = """FERGUSON
Why can't I speak?

COURTHOUSE CLERK
I'm really sorry. You need to be part of the lawsuit to testify.

FERGUSON
I was at Stuyvesant High. They told us it was safe to go back.

HENRY
How old are you?

FERGUSON
Twenty-four.

HENRY
Sit down. Let me take some details.

FERGUSON
I've just been told I have to leave.

HENRY
You are not going anywhere.
"""

# Nothing a regex can read as an exchange: prose, no cues at all.
UNREADABLE = (
    "A room above a shop in the old quarter. Rain against the window. "
    "The woman who lives here has not been seen for some days, and the man "
    "on the stairs is not sure whether to knock. He waits a long time. "
) * 6

META = {
    "title": "Anita Ferguson",
    "author": "Unknown",
    "characters": [{"name": "FERGUSON"}, {"name": "HENRY"}, {"name": "COURTHOUSE CLERK"}],
}
FRAMING = [{"scene": 1, "title": "The Hearing", "description": "Ferguson is turned away."}]


class TheReaderGoesFirst(unittest.TestCase):
    def setUp(self):
        self.parser = ScriptParser()

    def _parse(self, text):
        with patch.object(ScriptParser, "extract_script_metadata", return_value=META), \
             patch.object(ScriptParser, "analyze_scenes_batch", return_value=FRAMING), \
             patch.object(ScriptParser, "extract_combined") as combined, \
             patch.object(ScriptParser, "extract_scenes_chunked") as chunked, \
             patch.object(ScriptParser, "extract_scenes_from_text") as from_text:
            result = self.parser.parse_script(text.encode(), "txt", "sides.txt")
            return result, combined, chunked, from_text

    def test_a_side_is_read_not_guessed(self):
        result, combined, chunked, from_text = self._parse(SIDE)
        combined.assert_not_called()
        chunked.assert_not_called()
        from_text.assert_not_called()

    def test_every_speech_survives(self):
        result, *_ = self._parse(SIDE)
        lines = [l for s in result["scenes"] for l in s["lines"]]
        self.assertEqual(len(lines), 8)
        self.assertIn("Twenty-four", " ".join(l["text"] for l in lines))

    def test_the_whole_cast_is_kept(self):
        result, *_ = self._parse(SIDE)
        self.assertEqual(
            {l["character"] for s in result["scenes"] for l in s["lines"]},
            {"FERGUSON", "COURTHOUSE CLERK", "HENRY"},
        )

    def test_the_model_still_names_it(self):
        result, *_ = self._parse(SIDE)
        self.assertEqual(result["scenes"][0]["title"], "The Hearing")


class WhenThereIsNothingToRead(unittest.TestCase):
    """Prose with no cues in it. The reader finds no exchange, so the model
    gets its turn exactly as it used to."""

    def setUp(self):
        self.parser = ScriptParser()

    def test_the_model_is_asked(self):
        combined_result = {
            "metadata": {"title": "The Stairs", "characters": []},
            "scenes": [{
                "title": "On the stairs",
                "character_1": "MAN", "character_2": "WOMAN",
                "lines": [
                    {"character": "MAN", "text": "Are you there?"},
                    {"character": "WOMAN", "text": "I am."},
                    {"character": "MAN", "text": "May I come in?"},
                    {"character": "WOMAN", "text": "If you like."},
                ],
            }],
        }
        with patch.object(ScriptParser, "extract_script_metadata", return_value=META), \
             patch.object(ScriptParser, "extract_combined", return_value=combined_result) as combined:
            result = self.parser.parse_script(UNREADABLE.encode(), "txt", "prose.txt")
        combined.assert_called_once()
        self.assertEqual(len(result["scenes"]), 1)
        self.assertEqual(len(result["scenes"][0]["lines"]), 4)


if __name__ == "__main__":
    unittest.main()
