"""Tests for search query-type classification (search_logs.query_type).

Log-only classifier, so the bar is "does the August brief get a usable
breakdown", not perfection. What these lock in is the shape that would make the
breakdown useless: everything collapsing into `multi`, or a title search being
counted as attribute browsing.
"""

from app.services.search.query_type import QUERY_TYPES, classify_query


class TestTitleQueries:
    def test_bare_title_is_title_not_multi(self):
        # "monologue" is what every query is about; counting it as an attribute
        # would push every title search into `multi` and flatten the report.
        assert classify_query("fleabag") == "title"
        assert classify_query("fleabag monologue") == "title"

    def test_multiword_title(self):
        assert classify_query("into the woods audition") == "title"

    def test_ai_extracted_play_counts_as_title(self):
        assert classify_query("that show about the chess girl", intended_play="The Queen's Gambit") == "title"

    def test_source_type_constraint_does_not_make_it_multi(self):
        # Naming a show sets source_type as a side effect; it is not a second
        # independent thing the actor asked for.
        assert classify_query("bridgerton", parsed_constraints={"source_type": "tv"}) == "title"


class TestNamedLookup:
    def test_character_name(self):
        assert classify_query("regina george") == "named_lookup"

    def test_known_author(self):
        assert classify_query("chekhov") == "named_lookup"

    def test_by_author_phrase(self):
        assert classify_query("something by tennessee williams") == "named_lookup"

    def test_ai_extracted_author(self):
        assert classify_query("that russian playwright", intended_author="Anton Chekhov") == "named_lookup"


class TestOccupation:
    def test_lawyer(self):
        assert classify_query("lawyer") == "occupation"

    def test_occupation_plus_attribute_is_multi(self):
        assert classify_query("angry lawyer") == "multi"


class TestAttribute:
    def test_word_vocabulary(self):
        assert classify_query("funny") == "attribute"

    def test_parsed_constraints_alone(self):
        assert classify_query("something upbeat", parsed_constraints={"tone": "comedic"}) == "attribute"

    def test_stacked_attributes_stay_attribute(self):
        # Several descriptors are still one kind of asking — `multi` is for
        # mixing *categories*, not for counting adjectives.
        assert classify_query("funny female teen 2 minutes") == "attribute"


class TestMulti:
    def test_title_plus_attribute(self):
        assert classify_query("funny fleabag monologue") == "multi"

    def test_character_plus_title(self):
        # "cady heron in mean girls jr" names both a person and a show.
        assert classify_query("cady heron in mean girls jr") == "multi"


class TestOtherAndSafety:
    def test_empty(self):
        assert classify_query("") == "other"
        assert classify_query("   ") == "other"

    def test_none_query(self):
        assert classify_query(None) == "other"

    def test_freeform_theme_is_other(self):
        assert classify_query("losing someone you love") == "other"

    def test_gibberish(self):
        assert classify_query("asdkjhaskdjh") == "other"

    def test_always_returns_a_known_value(self):
        samples = [
            "fleabag", "regina george", "lawyer", "funny", "",
            "funny fleabag monologue", "asdf", "monologue by shakespeare",
            "2 minute dramatic female", "the crucible", None, 12345,
        ]
        for s in samples:
            assert classify_query(s) in QUERY_TYPES
