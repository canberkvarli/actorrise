"""A scene must not contain lines from a different scene.

Prod, script 108 (A Midsummer Night's Dream, Act 2 Sc 1 and Act 5 Sc 1 both
picked). The scene stored as "Act 2, Scene 1 — Encounter between Robin
Goodfellow and a Fairy" came out as:

    ROBIN   How now, spirit? Whither wander you?        <- Act 2
    FAIRY   Over hill, over dale...                     <- Act 2
    ROBIN   The King doth keep his revels here tonight  <- Act 2
    ROBIN   Now the hungry lion roars...                <- ACT 5
    ROBIN   If we shadows have offended...              <- ACT 5, the epilogue

The last two are from the other end of the play, and "Now the hungry lion roars"
was simultaneously stored as the closing line of the Act 5 scene, so one speech
existed in two scenes at once.

_recover_dropped_dialogue is the lossless guard added for Ayush's dropped
interjections (2026-07-23). For each scene it re-parses the source for that
scene's two characters and swaps the result in when it finds materially more.
But it re-parses `raw_text` — the entire document — so it gathers every line
those two characters speak *anywhere*. On a single-scene side, which is what it
was written for, "the whole document" and "this scene" are the same text and it
is correct. On a play it drags Robin's Act 5 epilogue into his Act 2 entrance.

The guard now prefers the chunk the scene was extracted from, falling back to
the whole document only when there is no chunk to speak of — which keeps the
side case, and Ayush's fix, working exactly as before.
"""

import unittest
from unittest.mock import patch

from app.services.script_parser import (
    ScriptParser,
    _recover_dropped_dialogue,
    _align_to_source,
)
from app.services.script_structure import detect_structure

ACT_2 = """ACT 2. SCENE 1.

ROBIN
How now, spirit? Whither wander you?

FAIRY
Over hill, over dale, thorough bush, thorough brier,
Over park, over pale, thorough flood, thorough fire;
I do wander everywhere, swifter than the moon's sphere.

ROBIN
The King doth keep his revels here tonight.
Take heed the Queen come not within his sight.
"""

ACT_5 = """ACT 5. SCENE 1.

THESEUS
More strange than true. I never may believe
These antique fables, nor these fairy toys.

HIPPOLYTA
But all the story of the night told over,
And all their minds transfigured so together.

ROBIN
Now the hungry lion roars, and the wolf behowls the moon,
Whilst the heavy plowman snores, all with weary task fordone.

ROBIN
If we shadows have offended, think but this and all is mended:
That you have but slumbered here while these visions did appear.
"""

WHOLE_PLAY = ACT_2 + "\n" + ACT_5


def _act2_scene(lines=None):
    return {
        "title": "Encounter between Robin Goodfellow and a Fairy",
        "character_1": "ROBIN",
        "character_2": "FAIRY",
        "act": "Act 2",
        "scene_number": "Scene 1",
        "lines": lines
        if lines is not None
        else [{"character": "ROBIN", "text": "How now, spirit? Whither wander you?"}],
    }


class TheGuardStaysInsideItsOwnScene(unittest.TestCase):
    def test_act_five_does_not_leak_into_act_two(self):
        scene = _act2_scene()
        scene["_source_text"] = ACT_2

        repaired = _recover_dropped_dialogue([scene], WHOLE_PLAY)
        spoken = " ".join(l["text"] for l in repaired[0]["lines"])

        self.assertNotIn("hungry lion", spoken)
        self.assertNotIn("shadows have offended", spoken)

    def test_the_scenes_own_dialogue_is_still_recovered(self):
        """The guard must keep doing its job, just within the right boundary."""
        scene = _act2_scene()
        scene["_source_text"] = ACT_2

        repaired = _recover_dropped_dialogue([scene], WHOLE_PLAY)
        spoken = " ".join(l["text"] for l in repaired[0]["lines"])

        self.assertIn("Over hill, over dale", spoken)
        self.assertIn("doth keep his revels", spoken)

    def test_a_side_with_no_chunk_still_repairs_from_the_document(self):
        """Ayush's case: one scene, no chunks. The whole file IS the scene."""
        scene = _act2_scene()  # deliberately no _source_text

        repaired = _recover_dropped_dialogue([scene], ACT_2)
        spoken = " ".join(l["text"] for l in repaired[0]["lines"])

        self.assertIn("Over hill, over dale", spoken)

    def test_align_to_source_also_respects_the_boundary(self):
        scene = _act2_scene(
            lines=[
                {"character": "ROBIN", "text": "How now, spirit? Whither wander you?"},
                {"character": "FAIRY", "text": "Over hill, over dale, thorough bush, thorough brier,"},
            ]
        )
        scene["_source_text"] = ACT_2

        aligned = _align_to_source([scene], WHOLE_PLAY)
        spoken = " ".join(l["text"] for l in aligned[0]["lines"])
        self.assertNotIn("hungry lion", spoken)


class EndToEndAcrossTwoPickedScenes(unittest.TestCase):
    """Both scenes picked out of one file, the way the scene picker sends them."""

    def setUp(self):
        self.parser = ScriptParser()
        self.chunks = detect_structure(WHOLE_PLAY)

    def test_each_scene_keeps_to_its_act(self):
        # The AI returns a thin result for each chunk; the guard then "repairs"
        # it, which is exactly when the leak used to happen.
        def fake_chunk_ai(chunk_text, *_args, **_kwargs):
            if "hungry lion" in chunk_text:
                return [{"title": "The Lovers", "character_1": "THESEUS",
                         "character_2": "HIPPOLYTA",
                         "lines": [{"character": "THESEUS", "text": "More strange than true."}]}]
            return [{"title": "Robin and the Fairy", "character_1": "ROBIN",
                     "character_2": "FAIRY",
                     "lines": [{"character": "ROBIN", "text": "How now, spirit? Whither wander you?"}]}]

        with patch.object(self.parser, "extract_chunk_ai", side_effect=fake_chunk_ai):
            scenes = self.parser.extract_scenes_chunked(self.chunks, [], "MND", "Shakespeare")

        scenes = _align_to_source(scenes, WHOLE_PLAY)
        scenes = _recover_dropped_dialogue(scenes, WHOLE_PLAY)

        by_act = {s.get("act"): " ".join(l["text"] for l in s["lines"]) for s in scenes}
        self.assertNotIn("hungry lion", by_act.get("Act 2", ""))
        self.assertNotIn("shadows have offended", by_act.get("Act 2", ""))

    def test_no_speech_appears_in_two_scenes_at_once(self):
        """"Now the hungry lion roars" was stored in both. Once is the maximum."""
        def fake_chunk_ai(chunk_text, *_args, **_kwargs):
            return [{"title": "x", "character_1": "ROBIN", "character_2": "FAIRY",
                     "lines": [{"character": "ROBIN", "text": "How now, spirit? Whither wander you?"}]}]

        with patch.object(self.parser, "extract_chunk_ai", side_effect=fake_chunk_ai):
            scenes = self.parser.extract_scenes_chunked(self.chunks, [], "MND", "Shakespeare")
        scenes = _recover_dropped_dialogue(scenes, WHOLE_PLAY)

        appearances = sum(
            1
            for s in scenes
            if any("hungry lion" in l["text"] for l in s["lines"])
        )
        self.assertLessEqual(appearances, 1)


if __name__ == "__main__":
    unittest.main()
