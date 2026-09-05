"""Two characters' words must not end up on one actor's line.

Audited the whole of A Midsummer Night's Dream through the real pipeline:
95% of extracted lines are verbatim from the source. The residual 5% is not
invention, it is merged speakers:

    ROBIN  "I'll put a girdle round about the Earth OBERON Having once this juice,"
    ROBIN  "Ay, there it is. OBERON I pray thee give it me."

Oberon's words, handed to the actor playing Robin. _split_inline_speakers and
_fix_merged_lines exist to catch exactly this, and both match against the cast
list the AI returns. That list gives the dramatis personae — "ROBIN GOODFELLOW",
"A FAIRY" — while the cues printed in the script are "ROBIN" and "FAIRY". The
names never matched, so the splitters had nothing to split on:

    AI cast   ROBIN GOODFELLOW, A FAIRY, OBERON, TITANIA, ...
    real cues ROBIN, FAIRY, FIRST FAIRY, SECOND FAIRY, OBERON, ...
    missing   FAIRY, FIRST FAIRY, ROBIN, SECOND FAIRY

The script itself knows who speaks: every cue is already recognised when the
deterministic parser reads it. speaker_vocabulary takes both sources, so a name
only the AI knows and a name only the page knows both count.
"""

import unittest

from app.services.script_parser import speaker_vocabulary, _fix_merged_lines

PLAY = """OBERON
I know a bank where the wild thyme blows.

ROBIN
Ay, there it is.

OBERON
I pray thee give it me.

FAIRY
Over hill, over dale, thorough bush, thorough brier.

ROBIN
I'll put a girdle round about the Earth.
"""


class TheVocabularyComesFromBothSources(unittest.TestCase):
    def test_cues_in_the_script_are_included(self):
        vocab = speaker_vocabulary(PLAY, ["Robin Goodfellow", "A Fairy", "Oberon"])
        self.assertIn("ROBIN", vocab)
        self.assertIn("FAIRY", vocab)

    def test_declared_names_survive_too(self):
        """A character named in the cast list but not yet cued still counts."""
        vocab = speaker_vocabulary(PLAY, ["Titania"])
        self.assertIn("TITANIA", vocab)

    def test_everything_comes_back_uppercase(self):
        vocab = speaker_vocabulary(PLAY, ["Robin Goodfellow"])
        self.assertTrue(all(n == n.upper() for n in vocab))

    def test_no_declared_names_still_reads_the_page(self):
        vocab = speaker_vocabulary(PLAY, [])
        self.assertIn("OBERON", vocab)

    def test_empty_text_falls_back_to_the_cast_list(self):
        self.assertIn("OBERON", speaker_vocabulary("", ["Oberon"]))


class MergedSpeakersGetSplit(unittest.TestCase):
    """The prod symptom, with the vocabulary the script actually uses."""

    def test_oberon_is_taken_off_robins_line(self):
        vocab = speaker_vocabulary(PLAY, ["Robin Goodfellow", "A Fairy", "Oberon"])
        scenes = [{
            "character_1": "ROBIN", "character_2": "OBERON",
            "lines": [{"character": "ROBIN",
                       "text": "Ay, there it is. OBERON I pray thee give it me."}],
        }]

        fixed = _fix_merged_lines(scenes, vocab)
        speakers = [l["character"] for l in fixed[0]["lines"]]

        self.assertIn("OBERON", speakers)
        robin = next(l for l in fixed[0]["lines"] if l["character"] == "ROBIN")
        self.assertNotIn("I pray thee give it me", robin["text"])

    def test_the_ai_cast_list_alone_could_not_do_this(self):
        """Pins the actual defect: the declared names never matched the cues."""
        declared = ["ROBIN GOODFELLOW", "A FAIRY", "OBERON"]
        scenes = [{
            "character_1": "ROBIN", "character_2": "OBERON",
            "lines": [{"character": "ROBIN",
                       "text": "Ay, there it is. OBERON I pray thee give it me."}],
        }]
        # OBERON is in the declared list, so this one does split; the names that
        # failed in prod were ROBIN and FAIRY, which the list never contained.
        vocab = speaker_vocabulary(PLAY, declared)
        self.assertIn("ROBIN", vocab)
        self.assertNotIn("ROBIN", [n.upper() for n in declared])

    def test_a_clean_line_is_left_alone(self):
        vocab = speaker_vocabulary(PLAY, ["Oberon"])
        scenes = [{
            "character_1": "ROBIN", "character_2": "OBERON",
            "lines": [{"character": "ROBIN", "text": "Ay, there it is."}],
        }]
        fixed = _fix_merged_lines(scenes, vocab)
        self.assertEqual(len(fixed[0]["lines"]), 1)
        self.assertEqual(fixed[0]["lines"][0]["text"], "Ay, there it is.")


if __name__ == "__main__":
    unittest.main()
