"""Tests for named show/title lookup detection.

15% of audited searches name the show the actor is auditioning for
("Bridgerton", "the witch in into the woods", "professor plum in clue!").
detect_title_lookup() spots those so the search response can say honestly
"we don't carry this title, here are adjacent pieces" (ContentGapBanner)
and the miss lands in search_logs.content_gap as a sourcing signal.
"""

import unittest

from app.services.search.title_lookup import compute_content_gap, detect_title_lookup


class DetectTitleLookupTests(unittest.TestCase):
    def _title(self, q):
        hit = detect_title_lookup(q)
        return hit["title"] if hit else None

    # -- real audit queries ------------------------------------------------
    def test_bare_show_name(self):
        self.assertEqual(self._title("Bridgerton"), "Bridgerton")

    def test_title_inside_sentence(self):
        self.assertEqual(
            self._title("a monologue that is good for the witch in into the woods"),
            "Into the Woods",
        )

    def test_monologue_from_title(self):
        self.assertEqual(self._title("monologue from beetlejuice"), "Beetlejuice")
        self.assertEqual(self._title("monologue from matilda"), "Matilda")

    def test_tv_show(self):
        self.assertEqual(self._title("breaking bad"), "Breaking Bad")

    def test_film_via_sentence(self):
        self.assertEqual(
            self._title("Tell me a 1 minute monologue I can practice from Cher from clueless"),
            "Clueless",
        )

    def test_character_alias_maps_to_title(self):
        self.assertEqual(
            self._title("funny monologue for a male looking to play professor plum in clue!"),
            "Clue",
        )

    def test_long_audition_sentence(self):
        self.assertEqual(
            self._title(
                "monologue for someone auditioning for Zoe and Alana and Jared "
                "in Dear Evan Hansen NOT FROM THE SHOW"
            ),
            "Dear Evan Hansen",
        )

    def test_jr_musical(self):
        self.assertEqual(
            self._title("a funny lightly awkward monologue for auditioning for Cady Heron in mean girls jr"),
            "Mean Girls",
        )

    def test_heathers(self):
        self.assertEqual(self._title("Heathers the musical"), "Heathers")

    def test_medium_is_reported(self):
        self.assertEqual(detect_title_lookup("bridgerton")["medium"], "tv")
        self.assertEqual(detect_title_lookup("into the woods")["medium"], "musical")

    # -- must NOT fire on ordinary descriptive queries ---------------------
    def test_no_hit_on_descriptive_queries(self):
        for q in (
            "dramatic monologue for young women",
            "guarded vulnerability female young adult",
            "dark comedy with male character",
            "woman nurse monologue under 2 min",
            "a small play of two characters, dramatic type, for teens",
        ):
            self.assertIsNone(detect_title_lookup(q), q)


class ComputeContentGapTests(unittest.TestCase):
    """Shared gap logic used by both the search endpoint and the golden harness."""

    def test_ai_intended_play_missing_from_results(self):
        gap = compute_content_gap("anything", "Bridgerton", None, ["Hamlet", "Macbeth"])
        self.assertEqual(gap, {"play": "Bridgerton", "author": None})

    def test_intended_play_present_in_results_is_not_a_gap(self):
        gap = compute_content_gap("anything", "Hamlet", None, ["Hamlet, Prince of Denmark"])
        self.assertIsNone(gap)

    def test_intended_author_present_is_not_a_gap(self):
        gap = compute_content_gap("wilde piece", None, "Oscar Wilde", [], ["Oscar Wilde"])
        self.assertIsNone(gap)

    def test_title_lookup_fallback_fires_when_ai_missed_it(self):
        gap = compute_content_gap("monologue from beetlejuice", None, None, ["Hamlet"])
        self.assertEqual(gap, {"play": "Beetlejuice", "author": None})

    def test_title_lookup_suppressed_when_library_has_the_play(self):
        gap = compute_content_gap("monologue from matilda", None, None, ["Matilda"])
        self.assertIsNone(gap)

    def test_no_gap_on_descriptive_query(self):
        gap = compute_content_gap("angry male 2 minutes", None, None, ["Hamlet"])
        self.assertIsNone(gap)


if __name__ == "__main__":
    unittest.main()
