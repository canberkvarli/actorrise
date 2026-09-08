"""The empty shelf: plays we list with zero monologues become a content gap
that says "we have it, no monologues yet", instead of a silent weak result."""

import unittest

from app.services.search.title_lookup import match_empty_shelf

SHELF = [
    ("Awake and Sing!", "Clifford Odets"),
    ("Golden Boy", "Clifford Odets"),
    ("The Spectacular Now", "Scott Neustadter"),
    ("War", "Unknown"),
    ("Test", None),
]


class MatchTests(unittest.TestCase):
    def test_exact_title(self):
        hit = match_empty_shelf("awake and sing", SHELF)
        self.assertEqual(hit["play"], "Awake and Sing!")
        self.assertEqual(hit["author"], "Clifford Odets")
        self.assertTrue(hit["carried_but_empty"])

    def test_title_inside_query(self):
        self.assertEqual(match_empty_shelf("the spectacular now monologue", SHELF)["play"], "The Spectacular Now")

    def test_misspelt_author(self):
        for q in ("clifford oddett", "clifford oddet", "odets"):
            hit = match_empty_shelf(q, SHELF)
            self.assertIsNotNone(hit, q)
            self.assertIsNone(hit["play"], q)
            self.assertEqual(hit["author"], "Clifford Odets", q)

    def test_short_or_descriptive_queries_never_match(self):
        self.assertIsNone(match_empty_shelf("war", SHELF))  # three letters
        self.assertIsNone(match_empty_shelf("test", SHELF))
        self.assertIsNone(match_empty_shelf("a funny monologue for a woman in her twenties please", SHELF))

    def test_unknown_author_is_not_a_hit(self):
        self.assertIsNone(match_empty_shelf("unknown", SHELF))

    def test_unrelated(self):
        self.assertIsNone(match_empty_shelf("rebellious teen southern", SHELF))
        self.assertIsNone(match_empty_shelf("black swan", SHELF))


if __name__ == "__main__":
    unittest.main()
