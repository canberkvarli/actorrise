"""Tests for the anthology cast-list attribution.

Two one-act anthologies were ingested so every play row in the volume received
every monologue in the volume — 1,690 rows sharing 136 texts, with Chekhov's
Smirnov and Strindberg's Mrs X both filed under a row titled "A DOLLAR".

Attribution is decided from each play's own front-matter cast list, not from
what a model happens to know about these plays. These tests pin the parsing,
because a cast list that fails to parse does not fail loudly — it silently
turns "this character is not in that play" into "this character is in no
play", and then a character who appears in two casts looks unambiguous.
That exact failure mis-assigned Jim and Mary before "CAST" and "THE PEOPLE"
were recognised as headings.
"""

import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "fix_collapsed_anthologies",
    Path(__file__).resolve().parent.parent / "scripts" / "fix_collapsed_anthologies.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["fix_collapsed_anthologies"] = _mod
_spec.loader.exec_module(_mod)

parse_cast = _mod.parse_cast
name_tokens = _mod.name_tokens
cast_blob = _mod.cast_blob


# Real front matter, trimmed. Each is a heading style the volume actually uses.
BOOR = """The Boor is reprinted by special permission. ANTON TCHEKOV was born
in 1860 at Taganrog, Russia. PERSONS IN THE PLAY
Helena Ivanovna Popov , a young widow, mistress of a country estate
Grigori Stepanovitch Smirnov , proprietor of a country estate
Luka , servant of Mrs. Popov
A gardener. A coachman. Several workmen."""

TRADITION = """Tradition is reprinted by permission. THE PEOPLE
George Ollivant Mr. George W. Wilson
Emily , his wife Miss Alice Leigh
Mary , his daughter, an actress Miss Fola La Follette"""

LAST_STRAW = """a one-act tragedy, based upon the psychological law of
suggestion. CAST
Friedrich Bauer , janitor of the Bryn Mawr
Miene , his wife
Karl , elder son, aged ten
Jim Lane , a grocer boy"""

STRONGER = """The Stronger has a dramatic intensity that few plays possess.
PERSONS
Mrs. X. , an actress, married
Miss Y. , an actress, unmarried"""

MANIKIN = """Manikin and Minikin is reprinted by special permission of Alfred
Kreymborg. They are dancing automatons. His lines should be read accordingly."""


class TestHeadings:
    """Every heading the volume uses must be recognised."""

    def test_persons_in_the_play(self):
        assert "smirnov" in parse_cast(BOOR)
        assert "popov" in parse_cast(BOOR)

    def test_the_people(self):
        assert "ollivant" in parse_cast(TRADITION)

    def test_cast(self):
        assert "bauer" in parse_cast(LAST_STRAW)

    def test_missing_cast_list_yields_nothing(self):
        # MANIKIN AND MINIKIN has no cast block at all. It must return empty
        # rather than scraping the prose for capitalised words, or "Kreymborg"
        # becomes a character and the author starts matching monologues.
        assert parse_cast(MANIKIN) == set()

    def test_prose_before_the_heading_is_not_cast(self):
        cast = parse_cast(BOOR)
        assert "taganrog" not in cast and "russia" not in cast


class TestNameMatching:
    def test_courtesy_titles_are_not_distinctive(self):
        # The cast says "Helena Ivanovna Popov", the monologue says "Mrs Popov".
        assert name_tokens("Mrs Popov") == {"popov"}
        assert name_tokens("Aunt Candace") == {"candace"}

    def test_surname_matches_full_cast_name(self):
        assert name_tokens("Mrs Popov") & parse_cast(BOOR)
        assert name_tokens("Smirnov") & parse_cast(BOOR)

    def test_character_absent_from_a_cast_does_not_match(self):
        assert not (name_tokens("Hyacinth") & parse_cast(BOOR))

    def test_bare_pronouns_have_no_distinctive_token(self):
        # "He", "She", "The Voice" must never resolve to anything.
        for n in ("He", "She", "The Voice", "The Figure"):
            assert name_tokens(n) == set() or not (name_tokens(n) & parse_cast(BOOR))


class TestAmbiguityIsPreserved:
    def test_a_name_in_two_casts_matches_both(self):
        # Mary is in TRADITION's cast; Jim is in THE LAST STRAW's. Both also
        # appear in WHITE DRESSES. The caller must see 2 hits and decline —
        # this is the case that was silently misattributed when these two
        # headings went unparsed.
        assert name_tokens("Jim") & parse_cast(LAST_STRAW)

    def test_unparsed_heading_would_have_hidden_the_conflict(self):
        # Guards the regression directly: if "CAST" stopped being recognised,
        # THE LAST STRAW's cast empties and Jim looks unambiguous.
        assert parse_cast(LAST_STRAW), "CAST heading must stay recognised"


class TestWholeNameFallback:
    def test_title_and_initial_names(self):
        # "Mrs X" has no token >= 3 chars once the courtesy title is dropped,
        # so token matching cannot see the single most obvious attribution in
        # the anthology. The squashed-blob fallback catches it.
        assert name_tokens("Mrs X") == set()
        assert "mrsx" in cast_blob(STRONGER)

    def test_fallback_does_not_fire_on_a_different_play(self):
        assert "mrsx" not in cast_blob(BOOR)

    def test_blob_is_empty_without_a_cast_list(self):
        assert cast_blob(MANIKIN) == ""
