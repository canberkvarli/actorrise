"""Turkish query intent (CAN-19).

Turkish actors type "komik monolog kadın" and "2 dakikadan kısa". The tier-3
LLM reads Turkish, but single words, filter-only queries and durations go
through keyword code that only knew English, Italian, Spanish, French and
Portuguese.
"""

import unittest

from app.services.search.query_optimizer import (
    KeywordExtractor,
    QueryClassifier,
    is_filter_only_query,
)
from app.services.search.turkish_vocab import tr_age_range, tr_duration_bounds, tr_lower, tr_stem


class TurkishStemTests(unittest.TestCase):
    def test_inflected_forms_land_on_the_word(self):
        self.assertEqual(tr_stem("kadınlar"), "kadın")
        self.assertEqual(tr_stem("kadının"), "kadın")
        self.assertEqual(tr_stem("erkeği"), "erkek")  # ğ softening undone
        self.assertEqual(tr_stem("aşkı"), "aşk")
        self.assertEqual(tr_stem("diziden"), "dizi")
        self.assertEqual(tr_stem("gücü"), "güç")

    def test_never_lands_outside_the_vocabulary(self):
        for word in ("monologue", "mine", "lover", "drama-", "yasa", "kader-x", "anime"):
            self.assertIsNone(tr_stem(word), word)

    def test_dotted_capital_i(self):
        self.assertEqual(tr_lower("İHANET"), "ihanet")


class TurkishExtractionTests(unittest.TestCase):
    def test_comic_woman(self):
        f = KeywordExtractor.extract("komik monolog kadın")
        self.assertEqual(f.get("tone"), "comedic")
        self.assertEqual(f.get("gender"), "female")

    def test_dramatic_man_inflected(self):
        f = KeywordExtractor.extract("dramatik erkek monoloğu")
        self.assertEqual(f.get("tone"), "dramatic")
        self.assertEqual(f.get("gender"), "male")

    def test_themes_and_era(self):
        f = KeywordExtractor.extract("ihanet ve intikam üzerine klasik bir parça")
        self.assertEqual(f.get("category"), "classical")
        self.assertIn("betrayal", f.get("themes", []))
        self.assertIn("revenge", f.get("themes", []))

    def test_author_turkish_spelling(self):
        self.assertEqual(KeywordExtractor.extract("şekspir monoloğu").get("author"), "William Shakespeare")
        self.assertEqual(KeywordExtractor.extract("Çehov").get("author"), "Anton Chekhov")

    def test_series_and_film(self):
        self.assertEqual(KeywordExtractor.extract("diziden sahne").get("source_type"), ["tv"])
        self.assertEqual(KeywordExtractor.extract("filmden monolog").get("source_type"), ["film"])

    def test_english_still_wins(self):
        f = KeywordExtractor.extract("funny monologue for a woman")
        self.assertEqual(f.get("tone"), "comedic")
        self.assertEqual(f.get("gender"), "female")


class TurkishDurationTests(unittest.TestCase):
    def test_under(self):
        self.assertEqual(tr_duration_bounds("2 dakikadan kısa"), {"max_duration": 120})
        self.assertEqual(tr_duration_bounds("en fazla 90 saniye"), {"max_duration": 90})
        self.assertEqual(tr_duration_bounds("3 dakika altı"), {"max_duration": 180})

    def test_over(self):
        self.assertEqual(tr_duration_bounds("1 dakikadan uzun"), {"min_duration": 60})
        self.assertEqual(tr_duration_bounds("en az 2 dakika"), {"min_duration": 120})

    def test_range_and_target(self):
        self.assertEqual(tr_duration_bounds("1-2 dakika"), {"min_duration": 60, "max_duration": 120})
        self.assertEqual(tr_duration_bounds("3 dakikalık monolog"), {"min_duration": 90, "max_duration": 180})

    def test_short_long(self):
        self.assertEqual(tr_duration_bounds("kısa komik monolog"), {"max_duration": 90})
        self.assertEqual(tr_duration_bounds("uzun bir tirat"), {"min_duration": 180})

    def test_flows_through_extract(self):
        f = KeywordExtractor.extract("20 yaşında biri için komik monolog, 2 dakikadan kısa")
        self.assertEqual(f.get("max_duration"), 120)
        self.assertEqual(f.get("age_range"), "20s")
        self.assertEqual(f.get("tone"), "comedic")


class TurkishAgeTests(unittest.TestCase):
    def test_decades(self):
        self.assertEqual(tr_age_range("20'li yaşlarda kadın"), "20s")
        self.assertEqual(tr_age_range("30lu yaşlar"), "30s")
        self.assertEqual(tr_age_range("orta yaşlı adam"), "40s")

    def test_english_is_not_a_decade(self):
        self.assertIsNone(tr_age_range("a 10 line speech"))

    def test_words(self):
        self.assertEqual(KeywordExtractor.extract("genç kız").get("age_range"), "teens")
        self.assertEqual(KeywordExtractor.extract("yaşlı adam").get("age_range"), "60+")


class TurkishTierTests(unittest.TestCase):
    def test_single_word_is_tier_one(self):
        self.assertEqual(QueryClassifier.classify("komik"), 1)
        self.assertEqual(QueryClassifier.classify("Kadınlar"), 1)

    def test_known_words_are_tier_two(self):
        self.assertEqual(QueryClassifier.classify("komik monolog kadın"), 2)

    def test_anything_else_goes_to_the_llm(self):
        self.assertEqual(QueryClassifier.classify("annesini kaybetmiş bir kızın vedası"), 3)


class TurkishFilterOnlyTests(unittest.TestCase):
    def test_filter_only(self):
        self.assertTrue(is_filter_only_query("komik monolog kadın"))
        self.assertTrue(is_filter_only_query("2 dakikadan kısa dramatik erkek monoloğu"))

    def test_has_content(self):
        self.assertFalse(is_filter_only_query("annesini kaybetmiş bir kız"))

    def test_english_unchanged(self):
        self.assertTrue(is_filter_only_query("funny woman 2 min"))
        self.assertFalse(is_filter_only_query("a speech about my brother"))


if __name__ == "__main__":
    unittest.main()


class TurkishModernMeansContemporaryTests(unittest.TestCase):
    """The Turkish UI says "modern" for contemporary (2026-11-03)."""

    def test_turkish_modern_is_contemporary(self):
        self.assertEqual(KeywordExtractor.extract("öfkeli erkek monoloğu, modern").get("category"), "contemporary")
        self.assertEqual(KeywordExtractor.extract("modern komik kadın").get("category"), "contemporary")

    def test_english_modern_keeps_its_period_meaning(self):
        self.assertEqual(KeywordExtractor.extract("modern monologue for a woman").get("category"), "modern")
        self.assertEqual(KeywordExtractor.extract("modern drama").get("category"), "modern")
