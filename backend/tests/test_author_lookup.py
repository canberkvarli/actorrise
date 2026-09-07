"""Naming an author is a lookup, not a similarity question.

The Shakespeare starting point sends "shakespeare monologue". That went to the
vector index, which answered the only way it can: with whatever text is most
Shakespeare-ish. Measured 2026-09-07, the candidate pool was 23 pieces from 5
plays — 17 of them Hamlet — out of the 1,689 Shakespeare pieces the library
holds, and the page came back 10 of 16 Hamlet with "To be, or not to be" on it
twice.

diversify_by_play could not have saved that. Its cap of 2 per play appends the
overflow rather than dropping it, so the caller's [:limit] pulls it straight
back the moment the diverse pieces run out; a cap cannot fill 18 slots from 5
plays either way. The pool was the fault, so the fix is the retrieval.
"""

from app.api.monologues import _query_is_only_author


class TestQueryIsOnlyAuthor:
    """The guard that keeps real similarity queries on the vector path."""

    def test_author_plus_filler_is_a_lookup(self):
        for q in (
            "shakespeare monologue",
            "shakespeare monologues",
            "monologues by shakespeare",
            "a shakespeare speech",
            "best shakespeare audition pieces",
            "shakespeare",
        ):
            assert _query_is_only_author(q, "William Shakespeare"), q

    def test_extra_words_stay_on_the_vector_path(self):
        # These describe a piece, not an author's shelf. Routing them to the
        # lookup would throw away the part the actor actually cares about.
        for q in (
            "shakespeare monologue about grief",
            "angry shakespeare monologue for a woman",
            "shakespeare revenge speech",
        ):
            assert not _query_is_only_author(q, "William Shakespeare"), q

    def test_matches_on_surname_alone(self):
        # The extractor stores "William Shakespeare"; nobody types that.
        assert _query_is_only_author("shakespeare monologue", "William Shakespeare")

    def test_punctuation_and_case_fold_together(self):
        assert _query_is_only_author("Shakespeare, monologue!", "William Shakespeare")

    def test_empty_inputs_are_not_a_lookup(self):
        assert not _query_is_only_author("", "William Shakespeare")
        assert not _query_is_only_author("shakespeare", "")

    def test_a_different_author_does_not_match(self):
        # "chekhov monologue" must not be answered from Shakespeare's shelf.
        assert not _query_is_only_author("chekhov monologue", "William Shakespeare")
