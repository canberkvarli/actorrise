"""One library, one clock.

Two formulas were computing running time. app/utils/duration.py used 130 wpm
with pause accounting; scripts/extract_film_tv_monologues.py used
`round(word_count / 2.5)`, a flat 150 wpm with no pauses. They differ by about
25%, and the library ended up holding one "To be, or not to be" at 1:50 and its
twin at 2:19.

Running time is the first thing an actor screens on, and an audition is the one
place a wrong one has a cost: told "two minutes", handed a piece the site called
1:50 that actually runs 2:01, they get stopped. Under-reporting is the dangerous
direction, and 13,533 of 13,589 disagreeing rows were stored too SHORT.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.utils.duration import estimate_duration_seconds as est  # noqa: E402


class TestPlainTextDashes:
    """Gutenberg writes an em dash as "--". A third of the corpus has one."""

    def test_double_hyphen_pauses_like_an_em_dash(self):
        assert est("I said no--he kept asking--so I left and never came back") == \
               est("I said no—he kept asking—so I left and never came back")

    def test_one_dash_is_one_pause_not_two(self):
        # The naive fix — adding "-" to the character class — charges "--"
        # twice and makes plain text run LONGER than the typographic edition.
        assert est("a--b") == est("a—b")

    def test_a_long_run_of_hyphens_is_still_one_pause(self):
        assert est("a----b") == est("a—b")

    def test_a_hyphenated_word_is_not_a_pause(self):
        # "well-known" is one word, not a beat. This is why the rule is "--"
        # and not "-".
        assert est("a well-known man") == est("a wellknown man")

    def test_the_two_editions_of_one_speech_now_agree(self):
        curly = ("To be, or not to be, that is the question: "
                 "Whether ’tis nobler in the mind to suffer")
        plain = ("To be, or not to be--that is the question: "
                 "Whether 'tis nobler in the mind to suffer")
        # Not identical punctuation, so not identical times — but within a
        # second, rather than the 29 they were apart.
        assert abs(est(curly) - est(plain)) <= 1


class TestEstimatorContract:
    def test_it_is_deterministic(self):
        t = "Some speech, with punctuation--and a pause... and an end."
        assert est(t) == est(t)

    def test_empty_text_is_zero(self):
        assert est("") == 0
        assert est("   ") == 0

    def test_there_is_a_floor(self):
        # A one-word line still takes a moment to say.
        assert est("Yes.") >= 5

    def test_pauses_only_ever_add_time(self):
        # Enough clauses to clear the rounding: one comma is 0.2s and the
        # result is a whole number of seconds, so a single one can vanish.
        bare = " ".join(["word"] * 60)
        assert est(bare + ", a, b, c, d, e, f, g") > est(bare + " a b c d e f g")


class TestOnlyOneFormula:
    def test_the_film_tv_extractor_uses_the_shared_estimator(self):
        # It carried `round(word_count / 2.5)`. A second formula is how the
        # two Hamlets disagreed, so the guard is that the source no longer
        # contains one.
        src = (Path(__file__).resolve().parent.parent
               / "scripts" / "extract_film_tv_monologues.py").read_text()
        # The assignment, not the phrase: the comment above the fixed line
        # quotes the old formula on purpose, and matching prose would make
        # this guard fail for explaining itself.
        assert "duration_seconds = round(word_count / 2.5)" not in src
        assert "duration_seconds = estimate_duration_seconds(" in src
