"""Tests for the film/TV monologue quality classifier.

Canberk's bar for film/TV (2026-07-20): "need monologues not 1vs1 character
scenes or stage dir or weird languages." The TV corpus predates the >=75-word
rule (avg 64 words, 80% under 75), so this pass re-applies the full bar to
film/TV only. classify_piece routes each piece to keep / salvage / remove and
must never remove a clean single-speaker monologue.
"""

import unittest

from scripts.audit_film_tv_quality import classify_piece

CLEAN = (
    "I have been thinking about my father a great deal lately. He was a hard "
    "man, and I spent most of my life trying to earn a word of praise that "
    "never came. Now that he is gone I find myself repeating his gestures, "
    "his silences, the way he would look out the window when he did not want "
    "to answer a question. I swore I would never become him, and yet here I "
    "am, standing in his kitchen, looking out his window, saying nothing at "
    "all to the people who love me most."
)


class ClassifyPieceTests(unittest.TestCase):
    def test_clean_single_speaker_is_kept(self):
        bucket, _ = classify_piece(CLEAN, "film")
        self.assertEqual(bucket, "keep")

    def test_two_person_scene_is_removed(self):
        scene = (
            "MARIA: I told you it was over between us, and I meant every word.\n"
            "JOHN: You never meant anything you said, not once in ten years.\n"
            "MARIA: Then why are you still standing in my doorway at midnight?"
        )
        bucket, issues = classify_piece(scene, "tv")
        self.assertEqual(bucket, "remove")
        self.assertIn("scene", issues)

    def test_short_fragment_is_removed(self):
        bucket, issues = classify_piece("No. I won't do it. Not for you, not for anyone.", "tv")
        self.assertEqual(bucket, "remove")
        self.assertIn("too_short", issues)

    def test_foreign_language_is_removed(self):
        spanish = (
            "No puedo creer lo que me estas diciendo en este momento tan "
            "importante para los dos, porque siempre pense que nuestro amor "
            "seria suficiente para superar cualquier obstaculo que la vida nos "
            "pusiera en el camino, y ahora me doy cuenta de que estaba "
            "completamente equivocada sobre todo lo que creia saber de ti."
        )
        bucket, issues = classify_piece(spanish, "film")
        self.assertEqual(bucket, "remove")
        self.assertTrue(any(i.startswith("foreign") for i in issues), issues)

    def test_strippable_stage_directions_are_salvaged(self):
        # Same clean speech with a couple of wrylies; stripping them leaves a
        # clean >=75-word single-speaker monologue, so it is salvaged, not removed.
        with_wrylies = CLEAN.replace("lately.", "lately. (pauses)").replace(
            "am,", "am, (quietly)")
        bucket, issues = classify_piece(with_wrylies, "film")
        self.assertEqual(bucket, "salvage")
        self.assertIn("stage_dir", issues)

    def test_stage_direction_that_leaves_a_fragment_is_removed(self):
        # A short line padded only by a parenthetical: stripping leaves < 75 words.
        junk = "(long pause) Well. (beat) I suppose that is that, then. (exits)"
        bucket, _ = classify_piece(junk, "tv")
        self.assertEqual(bucket, "remove")

    def test_empty(self):
        self.assertEqual(classify_piece("", "tv")[0], "remove")


if __name__ == "__main__":
    unittest.main()
