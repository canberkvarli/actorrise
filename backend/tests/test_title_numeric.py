"""Number-insensitive title matching.

The library stores "Brooklyn Nine Nine"; actors type "brooklyn 99". The query
normalised to "brooklyn 99", squashed to "brooklyn99", and matched nothing —
the stored title squashes to "brooklynninenine", a different string — so a show
we hold 14 monologues from reported as not carried. Same shape as "Ocean's 11"
vs "Ocean's Eleven", "8 Mile" vs "Eight Mile", "Catch 22" typed with digits.

The fix folds single-token number words to their digits before squashing, so
"nine" and "9" land together. It is deliberately narrow: it only fires when the
query itself contains a number, only at >= _MIN_SQUASHED_CHARS, and a key two
titles collapse onto is dropped rather than guessed. Compound spellings like
"twenty one" are intentionally not resolved to 21 — the digit form still
matches the stored digit title, which is the case that actually comes up.
"""

import pytest

from app.services.search import title_lookup as tl


class FakeCatalogueDB:
    """Returns (title, source_type) rows for the _load_catalogue query."""

    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_args, **_kwargs):
        return self

    def fetchall(self):
        return list(self.rows)


@pytest.fixture(autouse=True)
def _clear_cache():
    tl.reset_catalogue_cache()
    yield
    tl.reset_catalogue_cache()


class TestNumericKey:
    def test_folds_number_words_to_digits_and_squashes(self):
        assert tl._numeric_key("Brooklyn Nine Nine") == "brooklyn99"
        assert tl._numeric_key("brooklyn 99") == "brooklyn99"

    def test_single_token_numbers_only(self):
        # "twenty one" is left as two tokens, not resolved to 21.
        assert tl._numeric_key("twenty one pilots") == "201pilots"

    def test_digit_titles_pass_through(self):
        assert tl._numeric_key("21 Jump Street") == "21jumpstreet"
        assert tl._numeric_key("Catch 22") == "catch22"

    def test_drops_leading_article(self):
        assert tl._numeric_key("The Magnificent Seven") == "magnificent7"


class TestDetection:
    def test_digit_query_finds_word_title(self):
        db = FakeCatalogueDB([("Brooklyn Nine Nine", "tv")])
        assert tl.detect_catalogue_title(db, "brooklyn 99") == {
            "title": "Brooklyn Nine Nine",
            "medium": "tv",
        }

    def test_word_query_still_matches_via_spaced_form(self):
        db = FakeCatalogueDB([("Brooklyn Nine Nine", "tv")])
        assert tl.detect_catalogue_title(db, "brooklyn nine nine")["title"] == (
            "Brooklyn Nine Nine"
        )

    def test_digit_query_finds_digit_title(self):
        db = FakeCatalogueDB([("Catch 22", "tv")])
        assert tl.detect_catalogue_title(db, "catch 22")["title"] == "Catch 22"

    def test_numberless_query_never_touches_numeric_index(self):
        # The numeric fallback only fires when the query carries a number, so an
        # ordinary lookup for a title we do not carry stays undetected.
        db = FakeCatalogueDB([("Brooklyn Nine Nine", "tv")])
        assert tl.detect_catalogue_title(db, "the west wing") is None

    def test_title_we_do_not_carry_stays_undetected(self):
        db = FakeCatalogueDB([("Brooklyn Nine Nine", "tv")])
        assert tl.detect_catalogue_title(db, "ocean's 11") is None

    def test_ambiguous_numeric_key_is_dropped_not_guessed(self):
        # Two distinct titles folding onto one numeric key must not resolve to
        # whichever loaded first.
        db = FakeCatalogueDB([("Agent Nine Nine", "film"), ("Agent 99", "tv")])
        tl._load_catalogue(db)
        assert "agent99" not in tl._catalogue_numeric_cache

    def test_only_numbered_titles_are_indexed(self):
        # A title with no number contributes nothing to the numeric index.
        db = FakeCatalogueDB([("Hamlet", "play"), ("Catch 22", "tv")])
        tl._load_catalogue(db)
        assert set(tl._catalogue_numeric_cache) == {"catch22"}

    def test_cache_reset_clears_the_numeric_index(self):
        db = FakeCatalogueDB([("Catch 22", "tv")])
        tl._load_catalogue(db)
        assert tl._catalogue_numeric_cache
        tl.reset_catalogue_cache()
        assert tl._catalogue_numeric_cache == {}
