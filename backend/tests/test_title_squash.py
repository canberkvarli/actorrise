"""Space-insensitive title matching.

An actor searched "Pen 15" on prod. The library holds the show as "Pen15" with
3 monologues. The query normalised to "pen 15", matched nothing, reported no
content gap at all, and the actor was told we had never heard of it — twice,
because they tried "Maya Pen 15" next and then left.

People do not agree with a catalogue about where the space goes in a title that
mixes letters and digits. Same shape as "Se7en" or "Ocean's 11".

The fallback is deliberately narrow: it runs only after every spaced form has
failed, only at >= _MIN_SQUASHED_CHARS, and a key that two different titles
squash onto is dropped rather than resolved arbitrarily.
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


class TestSquashTitle:
    def test_removes_spaces(self):
        assert tl._squash_title("Pen 15") == "pen15"
        assert tl._squash_title("Pen15") == "pen15"

    def test_still_drops_leading_article_and_punctuation(self):
        assert tl._squash_title("The Queen's Gambit") == "queensgambit"

    def test_normalise_keeps_spaces(self):
        # The phrase matching in detect_catalogue_title needs word boundaries;
        # squashing there would let a title match a coincidental run of letters.
        assert tl._normalise_title("the night manager") == "night manager"


class TestDetection:
    def test_spaced_query_finds_unspaced_title(self):
        db = FakeCatalogueDB([("Pen15", "tv")])
        assert tl.detect_catalogue_title(db, "Pen 15") == {
            "title": "Pen15",
            "medium": "tv",
        }

    def test_exact_match_still_wins(self):
        db = FakeCatalogueDB([("Pen15", "tv"), ("Hamlet", "play")])
        assert tl.detect_catalogue_title(db, "Hamlet")["title"] == "Hamlet"

    def test_title_we_do_not_carry_stays_undetected(self):
        db = FakeCatalogueDB([("Pen15", "tv")])
        assert tl.detect_catalogue_title(db, "The Hunger Games") is None

    def test_ambiguous_squash_is_dropped_not_guessed(self):
        # Two distinct titles collapsing onto one key must not silently
        # resolve to whichever was loaded first.
        db = FakeCatalogueDB([("Sun Set", "play"), ("Sunset", "film")])
        tl._load_catalogue(db)
        assert "sunset" not in tl._catalogue_squashed_cache

    def test_short_squashed_keys_are_not_trusted(self):
        # Below the length floor a squashed key collides too easily to use.
        db = FakeCatalogueDB([("A B C", "play")])
        tl._load_catalogue(db)
        assert all(
            len(k) >= tl._MIN_SQUASHED_CHARS for k in tl._catalogue_squashed_cache
        )

    def test_cache_reset_clears_the_squashed_index(self):
        db = FakeCatalogueDB([("Pen15", "tv")])
        tl._load_catalogue(db)
        assert tl._catalogue_squashed_cache
        tl.reset_catalogue_cache()
        assert tl._catalogue_squashed_cache == {}
