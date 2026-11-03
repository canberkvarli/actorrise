"""A query that is the start of a longer stored title names it only when it is
really that title's name. Cases are the 90 days of searches the prefix rule
matched (2026-11-03); "twilight" was being sent to The Twilight Zone."""

import unittest

from app.services.search.title_lookup import prefix_names_title

KEEP = [
    ("harry potter", "Harry Potter and the Prisoner of Azkaban"),
    ("queen charlotte", "Queen Charlotte: A Bridgerton Story"),
    ("kill bill", "Kill Bill: Vol. 1"),
    ("toy story", "Toy Story 3"),
    ("star wars", "Star Wars: Episode IV - A New Hope"),
    ("sweeney todd", "Sweeney Todd: The Demon Barber of Fleet Street"),
    ("rocky horror", "The Rocky Horror Picture Show"),
    ("spiderman", "Spider-Man: Into the Spider-Verse"),
    ("deadpool", "Deadpool 2"),
]

DROP = [
    ("twilight", "The Twilight Zone"),
    ("dramatic", "The Dramatic Values in Plautus"),
    ("dramatic", "Dramatic Reader for Lower Grades"),
    ("shakespeare", "Shakespeare in Love"),
    ("something", "Something Wicked This Way Comes"),
    ("jealousy", "The Jealousy of le Barbouillé (La Jalousie du Barbouillé)"),
    ("clockwork", "A Clockwork Orange"),
]


class PrefixNamesTitleTests(unittest.TestCase):
    def test_names_kept(self):
        for q, t in KEEP:
            self.assertTrue(prefix_names_title(q, t), (q, t))

    def test_words_dropped(self):
        for q, t in DROP:
            self.assertFalse(prefix_names_title(q, t), (q, t))


if __name__ == "__main__":
    unittest.main()
