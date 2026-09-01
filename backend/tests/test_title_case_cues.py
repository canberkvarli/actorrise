"""Title Case speaker cues, and the names that only look like speakers.

Both original patterns in PlainTextParser require an ALL-CAPS name. Gutenberg's
Ibsen, Molière, Chekhov and Pinero transcriptions set their speakers in Title
Case instead, so Tartuffe, Rosmersholm and An Enemy of the People each sat in
the library with their full text stored and zero monologues extracted. Measure
for Measure parsed and Tartuffe did not, for no better reason than the case of
the cue.

The guard matters as much as the pattern. A cue is only a character if it
recurs, and "ACT IV" recurs as faithfully as anyone.
"""

import pytest

from app.services.extraction.plain_text_parser import PlainTextParser


def _speech(words: int = 60) -> str:
    # Starts on a capital: the cue pattern requires it, which is what stops it
    # firing in the middle of an ordinary sentence.
    return "Now " + " ".join(["word"] * (words - 1))


def _play(*cues: str, repeats: int = 6) -> str:
    """A text where each cue speaks `repeats` times, in Title Case format."""
    lines = []
    for _ in range(repeats):
        for cue in cues:
            lines.append(f"{cue}. {_speech()}")
            lines.append("")
    return "\n".join(lines)


@pytest.fixture()
def parser():
    return PlainTextParser()


class TestTitleCaseCues:
    def test_title_case_speakers_are_found(self, parser):
        text = _play("Dorine", "Cleante", "Elmire")
        got = parser.extract_monologues(text, min_words=50, max_words=500)
        assert got
        assert {m["character"] for m in got} == {"Dorine", "Cleante", "Elmire"}

    def test_an_honorific_is_kept_with_the_name(self, parser):
        text = _play("Mrs. Stockmann", "Dr. Stockmann")
        got = parser.extract_monologues(text, min_words=50, max_words=500)
        assert {m["character"] for m in got} == {"Mrs Stockmann", "Dr Stockmann"}

    def test_a_bare_honorific_is_not_a_character(self, parser):
        """Otherwise "Mr." becomes the most talkative person in the play."""
        text = _play("Mr", "Mrs")
        got = parser.extract_monologues(text, min_words=50, max_words=500)
        assert got == []

    def test_a_cue_must_recur_to_count(self, parser):
        """One capitalised word and a full stop is a sentence, not a speaker."""
        text = _play("Dorine", repeats=2)
        assert parser.extract_monologues(text, min_words=50, max_words=500) == []

    def test_all_caps_plays_still_use_the_original_pattern(self, parser):
        text = "\n\n".join(f"HAMLET. {_speech()}" for _ in range(6))
        got = parser.extract_monologues(text, min_words=50, max_words=500)
        assert got and all(m["character"] == "Hamlet" for m in got)


class TestNameGuard:
    @pytest.mark.parametrize("bad", ["Act", "Scene", "Prologue", "Preface", "Epilogue"])
    def test_structural_headings_are_not_characters(self, parser, bad):
        assert not parser._is_plausible_character(bad)

    @pytest.mark.parametrize("roman", ["Iv", "Ix", "Xlix", "II", "MCMLXX"])
    def test_roman_numerals_are_not_characters(self, parser, roman):
        """A title-cased act number reads exactly like a short name."""
        assert not parser._is_plausible_character(roman)

    def test_a_name_spanning_lines_is_rejected(self, parser):
        """The ALL-CAPS patterns match [A-Z\\s], and \\s includes newlines.

        That is how Measure for Measure produced a character called
        "Act Iv\\n\\n\\nScene I" whose speech was the rest of the act.
        """
        assert not parser._is_plausible_character("ACT IV\r\n\r\n\r\nSCENE I")

    def test_a_heading_phrase_is_rejected(self, parser):
        assert not parser._is_plausible_character("Characters Of The Tragedy")

    @pytest.mark.parametrize("good", ["Dorine", "Dr. Stockmann", "Mme. Pernelle", "Rebecca"])
    def test_real_names_survive(self, parser, good):
        assert parser._is_plausible_character(good)

    def test_an_act_heading_cannot_smuggle_in_a_whole_act(self, parser):
        """The point of the guard: a bad cue takes its entire "speech" with it."""
        text = "\n\n".join(f"ACT IV. {_speech(400)}" for _ in range(6))
        assert parser.extract_monologues(text, min_words=50, max_words=500) == []
