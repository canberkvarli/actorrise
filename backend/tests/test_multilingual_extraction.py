"""Non-English query intent (tone/gender/era).

Actors search in their own language. "monologo comico" should map to the
comedic tone the same as "comic monologue", so filters engage instead of the
query falling through to weak cross-language semantic matching.
"""

import unittest

from app.services.search.query_optimizer import KeywordExtractor


class MultilingualExtractionTests(unittest.TestCase):
    def test_italian_comic_maps_to_comedic(self):
        # adele's actual query.
        f = KeywordExtractor.extract("monologo comico di 5 minuti")
        self.assertEqual(f.get("tone"), "comedic")
        self.assertEqual(f.get("max_duration"), 300)

    def test_italian_dramatic_and_gender(self):
        f = KeywordExtractor.extract("monologo drammatico uomo")
        self.assertEqual(f.get("tone"), "dramatic")
        self.assertEqual(f.get("gender"), "male")

    def test_spanish_accented(self):
        f = KeywordExtractor.extract("monólogo cómico de mujer")
        self.assertEqual(f.get("tone"), "comedic")
        self.assertEqual(f.get("gender"), "female")

    def test_italian_era_and_gender(self):
        f = KeywordExtractor.extract("contemporaneo donna")
        self.assertEqual(f.get("category"), "contemporary")
        self.assertEqual(f.get("gender"), "female")

    def test_french_gender(self):
        self.assertEqual(KeywordExtractor.extract("monologue femme").get("gender"), "female")


if __name__ == "__main__":
    unittest.main()
