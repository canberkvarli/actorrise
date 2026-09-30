"""The filter vocabulary and the keyword mappings must not drift apart.

`is_filter_only_query` decides whether cosine is meaningful for a query. When it
says yes, the relevance floor is bypassed, because every candidate has already
been validated by a hard SQL filter and there is no subject matter for the
embedding to be "about".

The bug this file pins: `sad woman`, `funny woman`, `fierce woman` and
`intense woman` were all filter-only, but `angry woman` was not. The anger
family lives only in KEYWORD_MAPPINGS and was never copied into the
hand-written list, so a real actor searching "angry woman" on 2026-09-22 got a
weak-match banner over results that were correct.
"""

import pytest

from app.services.search.query_optimizer import (
    KeywordExtractor,
    _FILTER_DIMENSIONS,
    _derived_filter_words,
    is_filter_only_query,
)


class TestEmotionFamilyIsFilterVocabulary:
    @pytest.mark.parametrize("word", [
        "angry", "furious", "rage", "mad", "enraged", "irate", "wrathful",
        "scared", "afraid", "terrified", "anxious", "nervous",
        "hopeful", "optimistic", "desperate", "hopeless",
        "melancholy", "mournful", "gloomy", "tearful",
    ])
    def test_emotion_word_alone_is_filter_only(self, word):
        assert is_filter_only_query(word) is True

    def test_anger_now_matches_sadness(self):
        # The exact asymmetry that caused the bug.
        assert is_filter_only_query("sad woman") is True
        assert is_filter_only_query("angry woman") is True

    def test_every_mapped_emotion_is_covered(self):
        for phrase in KeywordExtractor.KEYWORD_MAPPINGS["emotions"]:
            if " " in phrase:
                continue
            assert is_filter_only_query(phrase) is True, phrase


class TestContentWordsStayContent:
    """Subject matter must still be judged by cosine, or the floor is useless."""

    @pytest.mark.parametrize("query", [
        "betrayal", "monologue about betrayal", "love", "death", "grief",
        "macbeth", "iago", "villain",
    ])
    def test_theme_and_character_queries_are_not_filter_only(self, query):
        assert is_filter_only_query(query) is False

    @pytest.mark.parametrize("dim", ["themes", "famous_characters", "character_type"])
    def test_excluded_dimensions_are_not_in_the_derived_vocabulary(self, dim):
        derived = _derived_filter_words()
        mapped = {w for w in KeywordExtractor.KEYWORD_MAPPINGS[dim] if " " not in w}
        # 'wicked' and the like may coincide with a tone word; the point is that
        # the dimension is not pulled in wholesale.
        assert not mapped.issubset(derived), dim

    def test_a_real_content_query_is_not_filter_only(self):
        assert is_filter_only_query("contemporary monologue from a play") is False
        assert is_filter_only_query("young girl unaware of her terrible situation") is False


class TestDerivation:
    def test_only_the_chosen_dimensions_are_derived(self):
        assert _FILTER_DIMENSIONS == ("emotions", "gender", "age_range", "source_type", "tone")

    def test_source_type_words_are_filter_vocabulary(self):
        for w in ("tv", "film", "movie", "television", "series"):
            assert w in _derived_filter_words(), w

    def test_multilingual_gender_is_covered(self):
        # "donna" was already handled; "mujer" and "femme" were not.
        for w in ("donna", "mujer", "femme", "ragazza", "hombre"):
            assert is_filter_only_query(w) is True, w
