"""Naming a character and a place in the play must not make search worse.

Both bugs here came from one real request in the feedback inbox on 2026-09-13:

    "Rosalind's Act 3, Scene 2"

That speech exists (#1147, As You Like It, 166 words). The search returned Act 4
Scene 3 and Act 3 Scene 3, and not the one asked for -- while the bare query
"Rosalind" returned it fine. Being MORE specific produced a worse answer.

Two independent causes, each silent:

1. `_normalise_name("Rosalind's")` turned the apostrophe into a space, leaving
   "rosalind s". The stray "s" is not a filler word, so the trimmed query no
   longer EQUALLED a catalogue name and character routing never fired. The same
   token lost "Hamlet's speech", "Juliet's monologue", and every other
   possessive -- which is the most natural way an actor names a piece.

2. `QueryOptimizer.optimize` runs keyword extraction only on tiers 1 and 2. On
   tier 3 it sets `extracted_filters = {}` and defers to the LLM, whose filter
   schema has no act or scene field. So the act/scene regex that has been in
   `extract()` all along never ran for a natural-language query, and the
   numbers were dropped on the floor.

The conservatism of the character pre-pass is deliberate and load-bearing: the
query must NAME a character, not merely mention one, or "a monologue about
hamlet's grief" hijacks an attribute search. These tests pin the widening to
possessives and act/scene references only, and pin the things that must still
miss.
"""

import unittest

from app.services.search.query_optimizer import KeywordExtractor, QueryOptimizer
from app.services.search.title_lookup import _normalise_name


class PossessivesAreNotPartOfTheNameTests(unittest.TestCase):
    def test_ascii_apostrophe(self):
        self.assertEqual(_normalise_name("Rosalind's"), "rosalind")

    def test_smart_apostrophe_phones_insert(self):
        self.assertEqual(_normalise_name("Rosalind’s"), "rosalind")

    def test_possessive_inside_a_longer_query(self):
        self.assertEqual(_normalise_name("Hamlet's speech"), "hamlet speech")

    def test_a_plain_name_is_untouched(self):
        self.assertEqual(_normalise_name("Lady Macbeth"), "lady macbeth")

    def test_a_name_that_simply_ends_in_s_keeps_its_s(self):
        """'Thersites' is a character, not a possessive."""
        self.assertEqual(_normalise_name("Thersites"), "thersites")
        self.assertEqual(_normalise_name("Ulysses"), "ulysses")

    def test_initials_still_fold_the_old_way(self):
        self.assertEqual(_normalise_name("A. J."), "a j")


class ActSceneSurvivesEveryTierTests(unittest.TestCase):
    """The bug was tier-shaped: correct code that a whole tier never reached."""

    def test_plain_numbers(self):
        self.assertEqual(
            KeywordExtractor.extract_act_scene("rosalind act 3 scene 2"),
            {"act": 3, "scene": 2},
        )

    def test_roman_numerals(self):
        self.assertEqual(
            KeywordExtractor.extract_act_scene("act iii scene ii"),
            {"act": 3, "scene": 2},
        )

    def test_act_without_scene(self):
        self.assertEqual(KeywordExtractor.extract_act_scene("act 1"), {"act": 1})

    def test_a_number_must_follow_the_word(self):
        """'the third act' and '3 minutes' are not act filters."""
        for q in ("the third act", "a 3 minute piece", "act like a fool", "scene work"):
            self.assertEqual(KeywordExtractor.extract_act_scene(q), {}, q)

    def test_nothing_is_invented_from_an_empty_query(self):
        for q in ("", None):
            self.assertEqual(KeywordExtractor.extract_act_scene(q), {})

    def test_optimize_returns_them_on_the_ai_tier(self):
        """The whole point: tier 3 discards keyword extraction, these survive."""
        qo = QueryOptimizer()
        tier, filters = qo.optimize("Rosalind's Act 3, Scene 2")
        self.assertEqual(tier, 3, "this query should take the AI tier")
        self.assertEqual(filters.get("act"), 3)
        self.assertEqual(filters.get("scene"), 2)

    def test_explicit_filters_still_win(self):
        """A filter the actor set in the UI beats one parsed from their words."""
        qo = QueryOptimizer()
        _, filters = qo.optimize("Hamlet act 1 scene 2", {"act": 5})
        self.assertEqual(filters["act"], 5)
        self.assertEqual(filters["scene"], 2)

    def test_a_query_with_no_act_gains_no_act(self):
        qo = QueryOptimizer()
        _, filters = qo.optimize("angry young woman confronting her father")
        self.assertNotIn("act", filters)
        self.assertNotIn("scene", filters)


class TheDetectorStaysConservativeTests(unittest.TestCase):
    """Widened for possessives and act/scene ONLY. It must still refuse the rest.

    These run without a database by driving the normaliser and the token
    stripper directly, which is where the widening lives.
    """

    def test_a_descriptive_query_is_not_reduced_to_a_name(self):
        """'a monologue about hamlet's grief' must not become 'hamlet'."""
        from app.services.search.title_lookup import _ACT_SCENE_TOKENS, _TITLE_FILLER

        nq = _normalise_name("a monologue about hamlet's grief")
        located = _ACT_SCENE_TOKENS.sub(" ", nq)
        located = " ".join(w for w in located.split() if w not in _TITLE_FILLER).strip()
        self.assertNotEqual(located, "hamlet")
        self.assertIn("grief", located, "the describing word must survive")

    def test_act_scene_tokens_are_stripped_for_the_name_candidate(self):
        from app.services.search.title_lookup import _ACT_SCENE_TOKENS

        self.assertEqual(
            _ACT_SCENE_TOKENS.sub(" ", "rosalind act 3 scene 2").split(),
            ["rosalind"],
        )

    def test_the_word_act_alone_is_not_stripped(self):
        """A play called 'Act One' must keep its words; only act+NUMBER goes."""
        from app.services.search.title_lookup import _ACT_SCENE_TOKENS

        self.assertEqual(_ACT_SCENE_TOKENS.sub(" ", "act one").strip(), "act one")


if __name__ == "__main__":
    unittest.main()
