"""A script must never land on the shelf finished and empty.

Prod, 2026-09-04 21:31 (script 106, "Mnd"): the actor picked Act 5 Scene 1 of A
Midsummer Night's Dream out of the scene picker, waited, and got a script with
zero scenes and no error — the shelf item just said nothing. The Render log for
that minute is the whole story:

    21:31:56  Extracting dialogue from Act 5
    21:32:11  Extracted 0 rehearsal-ready scenes

Fifteen seconds, no exception, no scenes. `extract_chunk_ai` has three separate
paths that `return []` without a word — no JSON array in the reply, unsalvageable
JSON, or every scene failing the character_1/character_2 validation — and none of
them can be told apart from "this chunk genuinely has no dialogue". Replaying that
exact chunk three times gave completion lengths of 1705, 3663 and 1597 tokens: the
model is being asked to retype 24k characters of verse as JSON and its output
varies twofold run to run. Sometimes nothing usable comes back.

Two things were wrong, and both are pinned here:

1. The dialogue was sitting in the text the whole time. The chunk only reached the
   AI *because* the regex pre-filter found two or more speakers in it. When the AI
   returns nothing, the deterministic parse is the answer, not an empty script.
2. Zero scenes was written as `completed`, which is a lie that costs the actor
   their upload. It is a failure, and it must say so.
"""

import unittest
from unittest.mock import patch

from app.services.script_parser import ScriptParser
from app.services.script_structure import detect_structure


# Real verse, formatted the way the Folger text is once the FTLN column is
# stripped: a cue in caps on its own line, the speech beneath it.
PLAY_CHUNK = """ACT 5. SCENE 1.

THESEUS
More strange than true. I never may believe
These antique fables nor these fairy toys.

HIPPOLYTA
But all the story of the night told over,
And all their minds transfigured so together,
More witnesseth than fancy's images.

THESEUS
Here come the lovers, full of joy and mirth.
Joy, gentle friends, joy and fresh days of love
Accompany your hearts.

LYSANDER
More than to us
Wait in your royal walks, your board, your bed.

THESEUS
Come now, what masques, what dances shall we have,
To wear away this long age of three hours?

PHILOSTRATE
There is a brief how many sports are ripe.
Make choice of which your Highness will see first.

THESEUS
Say what abridgment have you for this evening?
"""


def _chunks():
    return detect_structure(PLAY_CHUNK)


class DeterministicFallbackWhenAIComesBackEmpty(unittest.TestCase):
    """The actor's dialogue is in the file. A flaky model must not lose it."""

    def setUp(self):
        self.parser = ScriptParser()

    def test_empty_ai_still_yields_a_scene(self):
        with patch.object(self.parser, "extract_chunk_ai", return_value=[]):
            scenes = self.parser.extract_scenes_chunked(_chunks(), [], "MND", "Shakespeare")

        self.assertTrue(
            scenes,
            "chunk had two-plus speakers and real dialogue; a silent [] from the "
            "model must fall back to the deterministic parse, not drop the scene",
        )

    def test_fallback_lines_come_from_the_source_verbatim(self):
        with patch.object(self.parser, "extract_chunk_ai", return_value=[]):
            scenes = self.parser.extract_scenes_chunked(_chunks(), [], "MND", "Shakespeare")

        spoken = " ".join(l["text"] for s in scenes for l in s["lines"])
        self.assertIn("I never may believe", spoken)
        self.assertIn("what masques, what dances shall we have", spoken)

    def test_fallback_keeps_the_act_and_scene_labels(self):
        """A fallback scene is still placed in the play, same as an AI one."""
        chunks = _chunks()
        with patch.object(self.parser, "extract_chunk_ai", return_value=[]):
            scenes = self.parser.extract_scenes_chunked(chunks, [], "MND", "Shakespeare")

        self.assertEqual(scenes[0]["act"], chunks[0].act_label)
        self.assertEqual(scenes[0]["scene_number"], chunks[0].scene_label)
        self.assertEqual(scenes[0]["act"], "Act 5")

    def test_fallback_names_the_two_busiest_speakers_as_leads(self):
        with patch.object(self.parser, "extract_chunk_ai", return_value=[]):
            scenes = self.parser.extract_scenes_chunked(_chunks(), [], "MND", "Shakespeare")

        leads = {scenes[0]["character_1"], scenes[0]["character_2"]}
        self.assertIn("THESEUS", leads)
        self.assertEqual(len(leads), 2, "a two-hander needs two distinct leads")

    def test_ai_result_is_left_alone_when_it_works(self):
        """The fallback is a net, not a second opinion."""
        from_ai = [{
            "title": "The Lovers and Their Joy",
            "character_1": "THESEUS",
            "character_2": "HIPPOLYTA",
            "lines": [{"character": "THESEUS", "text": "More strange than true."}],
        }]
        with patch.object(self.parser, "extract_chunk_ai", return_value=from_ai):
            scenes = self.parser.extract_scenes_chunked(_chunks(), [], "MND", "Shakespeare")

        self.assertEqual(len(scenes), 1)
        self.assertEqual(scenes[0]["title"], "The Lovers and Their Joy")

    def test_silence_is_kept_when_there_is_genuinely_no_dialogue(self):
        """Front matter has no speakers. Inventing a scene there is its own bug."""
        prose = detect_structure(
            "ACT 1. SCENE 1.\n\n" + ("The scene is laid in Athens, and in a wood near it. " * 30)
        )
        with patch.object(self.parser, "extract_chunk_ai", return_value=[]):
            scenes = self.parser.extract_scenes_chunked(prose, [], "MND", "Shakespeare")

        self.assertEqual(scenes, [])


class FallbackReadsTheSameTextTheAIWouldHave(unittest.TestCase):
    """The net has to catch the whole scene, not the easy half of it.

    Folger sets a speech that shares a verse line inline: "And we will hear it.
    PHILOSTRATE No, my noble lord." `extract_chunk_ai` runs the text through
    _split_inline_speakers first, so the AI never sees those run together. The
    fallback skipped that step, which glued the reply onto the previous
    character's speech and lost a speaker from the scene.
    """

    def test_inline_cue_becomes_its_own_line(self):
        parser = ScriptParser()
        text = """ACT 5. SCENE 1.

THESEUS
Say what abridgment have you for this evening?
What masque, what music? How shall we beguile
The lazy time, if not with some delight?
And we will hear it. PHILOSTRATE No, my noble lord,
It is not for you. I have heard it over,
And it is nothing, nothing in the world.

HIPPOLYTA
I love not to see wretchedness o'ercharged,
And duty in his service perishing.

THESEUS
Why, gentle sweet, you shall see no such thing.

HIPPOLYTA
He says they can do nothing in this kind.

THESEUS
The kinder we, to give them thanks for nothing.
"""
        cast = [{"name": "THESEUS"}, {"name": "PHILOSTRATE"}, {"name": "HIPPOLYTA"}]
        with patch.object(parser, "extract_chunk_ai", return_value=[]):
            scenes = parser.extract_scenes_chunked(detect_structure(text), cast, "MND", "S")

        spoken = {l["character"] for s in scenes for l in s["lines"]}
        self.assertIn(
            "PHILOSTRATE",
            spoken,
            "the inline cue was left buried in Theseus's speech, so Philostrate "
            "vanished from a scene he speaks in",
        )


class ZeroScenesIsAFailureNotACompletion(unittest.TestCase):
    """An empty script that says "completed" costs the actor their upload.

    Script 106 sat on the shelf marked finished, with the genre and synopsis
    filled in so it looked healthy, and no scenes. Nothing in the UI could tell
    the actor whether to wait, retry, or re-upload, because nothing in the row
    said anything had gone wrong.
    """

    def test_scenes_extracted_is_completed(self):
        from app.api.scripts import extraction_outcome

        status, error = extraction_outcome([{"lines": [1, 2, 3, 4]}])
        self.assertEqual(status, "completed")
        self.assertIsNone(error)

    def test_no_scenes_is_failed(self):
        from app.api.scripts import extraction_outcome

        status, _ = extraction_outcome([])
        self.assertEqual(status, "failed")

    def test_the_failure_tells_the_actor_what_to_do(self):
        """"Try again" is true here: the text is stored, so a re-cut is free."""
        from app.api.scripts import extraction_outcome

        _, error = extraction_outcome([])
        self.assertTrue(error)
        self.assertIn("again", error.lower())


if __name__ == "__main__":
    unittest.main()
