"""Tests for the scraped-boilerplate cleaner.

The failure it fixes: 100 monologues stored a disclaimer lifted from the source
site's page furniture as if a character had spoken it. It advertised a
competitor and, because embeddings are built from the monologue text alone and
the passage says "monologue" three times, it pulled those rows to the top of
any query phrased as "... monologue". On prod, "comedic female monologue"
returned two of them in the top three, both badged "Best pick".

The interesting tests are the refusals. Over-stripping deletes a character's
closing line, which is worse than leaving a citation visible.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "strip_scraped_boilerplate",
    Path(__file__).resolve().parent.parent / "scripts" / "strip_scraped_boilerplate.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["strip_scraped_boilerplate"] = _mod
_spec.loader.exec_module(_mod)

clean = _mod.clean
strip_citation_tail = _mod.strip_citation_tail

HEADER_TEXT = (
    "Note: We are not able to display the full text for this monologue. "
    "However, to assist users who already have access to the script, starting "
    "and ending lines are presented below. Please visit our monologue database "
    "to find monologues that include text. "
)

# 40+ words, so the >= 40 word guard in strip_citation_tail is satisfied and
# the tests exercise the citation logic rather than the length refusal.
SPEECH = (
    "Death is so scary. Aren't you scared? I don't want to die. I get so "
    "scared thinking about it, I can't sleep. Every night I touch my bedside "
    "light forty-four times and hold my breath for as long as I can and pray "
    "that the morning comes back again the way it always has before."
)


class TestHeader:
    def test_header_is_removed(self):
        out, removed = clean(HEADER_TEXT + SPEECH)
        assert "header" in removed
        assert out.startswith("Death is so scary")

    def test_competitor_advert_does_not_survive(self):
        out, _ = clean(HEADER_TEXT + SPEECH)
        assert "monologue database" not in out
        assert "not able to display" not in out

    def test_text_without_the_header_is_untouched(self):
        out, removed = clean(SPEECH)
        assert removed == []
        assert out == SPEECH


class TestCitationTails:
    @pytest.mark.parametrize(
        "citation",
        [
            "Howe, Tina. Approaching Zanzibar and other plays. Theatre "
            "Communications Group, New York, NY. 1995. p. 19.",
            "Reza, Yasmina, God of Carnage, Dramatists Play Service, 2008, pp. 35.",
            "Scott McPherson. Marvin's Room. New York: Dramatists Play Service "
            "Inc., 1993, pp. 47.",
            "Pinter, Harold. Betrayal Faber & Faber, 2013, p.115.",
            "Sally Cookson, Jane Eyre, Oberon Books, 2015, pp.124-125.",
        ],
    )
    def test_bibliographic_tail_is_removed(self, citation):
        out = strip_citation_tail(SPEECH + " " + citation)
        assert out == SPEECH
        # A half-removed citation is its own bug: the author's name gets left
        # sitting in the speech. No fragment of the citation may survive —
        # checked against its own words, since ordinary prose contains "p. "
        # inside "sleep. Every".
        for fragment in citation.replace(",", " ").split():
            if len(fragment) > 4 and fragment[:1].isupper():
                assert fragment not in out

    def test_editorial_pointer_is_removed(self):
        text = (
            HEADER_TEXT
            + SPEECH
            + " For full extended monologue, please refer to the script "
            "edition cited here: Lucy Kirkwood, The Children, Nick Hern "
            "Books, 2016, pp. 80-1."
        )
        out, removed = clean(text)
        assert "editorial_tail" in removed
        assert out == SPEECH

    def test_multi_sentence_publisher_block_is_fully_consumed(self):
        # The 4-segment cap left fifteen rows with half a citation attached:
        # a publisher city on its own sentence pushes the author out of reach.
        text = (
            SPEECH + " Inge, William. Four Plays. Grove Press, New York, NY. "
            "1958. pp. 125-126."
        )
        assert strip_citation_tail(text) == SPEECH

    def test_author_line_with_lowercase_connector(self):
        # "Swerling, Jo, and Burrows, Abe." kept its author line purely
        # because of the lowercase "and".
        text = (
            SPEECH + " Swerling, Jo, and Burrows, Abe. Guys and Dolls: A "
            "Musical Fable of Broadway, Music Theater International, 1951, pp 8-9."
        )
        assert strip_citation_tail(text) == SPEECH


class TestRefusals:
    """Where the cleaner must decline. Each is a way to eat real dialogue."""

    def test_title_of_address_does_not_end_a_segment(self):
        # Splitting "...speak to you Mr. | Condomine." makes "Condomine." look
        # like a bare author line, and the walk would eat a word of speech.
        text = SPEECH + " I want to speak to you Mr. Condomine."
        assert strip_citation_tail(text) == text

    def test_a_year_alone_is_not_a_citation(self):
        # A character may say a year. A character does not say "p. 283".
        text = SPEECH + " It was 1985 and I was still living at home."
        assert strip_citation_tail(text) == text

    def test_refuses_when_too_little_speech_would_remain(self):
        short = "I don't want to die. Please."
        text = short + " Reza, Yasmina, God of Carnage, Dramatists Play Service, 2008, pp. 35."
        assert strip_citation_tail(text) == text

    def test_line_ending_in_exclamation_is_speech_not_bibliography(self):
        text = SPEECH + " As we are!"
        assert strip_citation_tail(text) == text

    def test_never_returns_empty(self):
        out, _ = clean(HEADER_TEXT)
        assert out == "" or out.strip() == ""
        # The caller (the script) skips empty results rather than writing them;
        # this test pins that clean() does not invent content to fill the gap.
