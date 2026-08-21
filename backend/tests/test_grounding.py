"""Tests for the H-13 unservable-query check.

The motivating failure: "Erin Gruwell" returned 20 monologues from a film we do
not carry, cleared the weak-match bar on cosine alone, and told the actor
nothing. They rephrased twice and left.

The true positives are easy. The tests that matter are the false ones — a check
that fires on an ordinary search tells actors we failed when we did not, which
is worse than the bug it fixes. Three separate designs were tried and rejected
against 427 replayed real queries before this one; the rejected ones are pinned
below so they are not reinvented.
"""

import pytest

from app.services.search.grounding import distinctive_terms, query_is_unservable


class FakeDB:
    """Stands in for the corpus_terms lookup.

    `vocab` is what the library can answer for. The real table is built by
    scripts/build_corpus_terms.py from monologue text, titles, authors,
    characters, tones, themes and tags.
    """

    def __init__(self, vocab):
        self.vocab = {v.lower() for v in vocab}
        self.queries = 0

    def execute(self, stmt, params=None):
        self.queries += 1
        self._last = params or {}
        return self

    def fetchall(self):
        wanted = self._last.get("t") or []
        if not isinstance(wanted, (list, tuple)):
            return [(v,) for v in self.vocab]
        return [(t,) for t in wanted if t in self.vocab]

    def first(self):
        return (1,) if self.vocab else None


# A corpus that knows ordinary English and the works it carries, and has never
# heard of Erin Gruwell.
CORPUS = FakeDB({
    "ambition", "overlooked", "confession", "horror", "failure", "twenties",
    "mature", "confronting", "sarcastic", "manipulative", "heartfelt",
    "hamlet", "shakespeare", "chekhov", "vanya", "sisters", "rising",
    "night", "manager", "fleabag", "crowley", "beautiful", "voice",
    "discovers", "erin", "lucifer",
})


class TestCatchesTheRealFailure:
    def test_unknown_person_is_unservable(self):
        # The query that started this. "erin" is in the corpus; "gruwell" is
        # not, and it is the surname that decides whether we hold the film.
        assert query_is_unservable("Erin Gruwell", CORPUS) is True

    def test_unknown_actor_is_unservable(self):
        assert query_is_unservable("Hilary Swank", CORPUS) is True

    def test_unknown_show_is_unservable(self):
        assert query_is_unservable("Spiderman", CORPUS) is True

    def test_gibberish_is_unservable(self):
        assert query_is_unservable("asdf", CORPUS) is True
        assert query_is_unservable("courtroomasd", CORPUS) is True

    def test_language_we_do_not_stock(self):
        assert query_is_unservable("Monologues in Hindi", CORPUS) is True


class TestDoesNotFireOnRealSearches:
    """The expensive mistakes. Every one of these is a search we answer."""

    @pytest.mark.parametrize(
        "q",
        [
            "hamlet",
            "fleabag",
            "the night manager",
            "monologue by chekhov",
            "vanya",
            "manipulative woman",
            "male love confession",
            "beautiful voice",
        ],
    )
    def test_things_we_carry_are_servable(self, q):
        assert query_is_unservable(q, CORPUS) is False

    @pytest.mark.parametrize(
        "q",
        [
            "young woman discovers her voice",
            "angry young man confronting his father",
            "female monologue ambition overlooked",
            "sarcastic female teen monologue",
            "horror monologue for 20 year old woman",
        ],
    )
    def test_long_descriptive_queries_are_exempt(self, q):
        # REJECTED DESIGN 1: checking whether any RESULT contained a query word.
        # It flagged every one of these against real logged results, because a
        # thematic search is answered by meaning, not by literal overlap.
        assert query_is_unservable(q, CORPUS) is False

    @pytest.mark.parametrize("q", ["sad", "funny", "comedic 2 minute female"])
    def test_pure_filter_vocabulary_never_qualifies(self, q):
        assert query_is_unservable(q, CORPUS) is False

    def test_descriptors_characters_never_say_are_servable(self):
        # REJECTED DESIGN 2: a hand-written stopword list. No list of ordinary
        # English is ever complete — it flagged "ambition" and "confession".
        # REJECTED DESIGN 3: corpus vocabulary from monologue TEXT only. Actors
        # search with words characters never utter; "sarcastic" is the tone of
        # 540 pieces and appears in no speech. The vocabulary must include
        # metadata, which is why build_corpus_terms.py reads tone/themes/tags.
        for q in ["sarcastic", "manipulative", "heartfelt"]:
            assert query_is_unservable(q, CORPUS) is False


class TestTypos:
    def test_typo_of_a_filter_word_is_not_unservable(self):
        # "Comedic monologues femalr" corrects to "...female", which has no
        # distinctive term at all. Telling someone we have never heard of what
        # they want is the worst possible answer to a misspelling.
        assert query_is_unservable("Comedic monologues femalr", CORPUS) is False
        assert query_is_unservable("sad monolgoues", CORPUS) is False

    def test_a_bad_correction_cannot_deny_a_real_title(self):
        # The corrector rewrites "rising" -> "raisin" (fuzzy-matching A Raisin
        # in the Sun). Checking only the corrected form would have us deny
        # "rising seniors", a play we carry. Either form being servable is
        # enough.
        assert query_is_unservable("rising seniors", CORPUS) is False


class TestTokenisation:
    def test_possessive_is_stripped(self):
        # "Crowley's monologue" must look up "crowley", which the corpus holds.
        # Left as "crowley's" it matches nothing and we deny a real character.
        assert query_is_unservable("Crowley's monologue", CORPUS) is False

    def test_short_tokens_ignored(self):
        assert distinctive_terms("a to of an") == []

    def test_bare_numbers_ignored(self):
        assert distinctive_terms("90 second 2-3 minutes") == []

    def test_keeps_names(self):
        assert "gruwell" in distinctive_terms("Erin Gruwell")


class TestDegradesSafely:
    def test_no_db_is_never_unservable(self):
        assert query_is_unservable("Erin Gruwell", None) is False

    def test_empty_query(self):
        assert query_is_unservable("", CORPUS) is False
        assert query_is_unservable(None, CORPUS) is False

    def test_unbuilt_corpus_table_does_not_accuse_everything(self):
        # Before build_corpus_terms.py has ever run, every word looks unknown.
        # Flagging every search would be catastrophic; degrade to old behaviour.
        assert query_is_unservable("Erin Gruwell", FakeDB(set())) is False

    def test_db_error_degrades_to_false(self):
        class Boom:
            def execute(self, *a, **k):
                raise RuntimeError("connection reset")

        assert query_is_unservable("Erin Gruwell", Boom()) is False
