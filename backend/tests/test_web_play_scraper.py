"""The italic convention in a playwright's own PDF is the opposite of Folger's.

Every shape below is copied from the real text of Sam Graber's `Shooter` and
`The Seamaster`, because the bug this file exists to hold was invisible in the
abstract: 241 of 241 extracted candidates were rejected as `weird_chars`, and
the text was fine the whole time.
"""

from app.services.data_ingestion.web_play_scraper import (
    normalize_play_pdf_text,
    year_from_text,
)


class TestItalicConvention:
    def test_whole_italic_line_is_a_direction(self):
        out = normalize_play_pdf_text("TROY\n\x02TROY goes to one of the desks.\x03")
        assert "[_TROY goes to one of the desks._]" in out

    def test_italic_inside_a_roman_line_is_emphasis_and_keeps_its_words(self):
        # The Folger rule would read "Al-right!" as an action and delete it.
        out = normalize_play_pdf_text(
            "\x02Al-right!\x03 Well! Guess it’s just gonna be us."
        )
        assert "Al-right! Well! Guess it’s just gonna be us." in out
        assert "[_" not in out

    def test_wrapped_direction_is_joined_into_one(self):
        # The typesetter wrapped this across four lines; it is one sentence.
        raw = (
            "\x02House lights are up as TROY appears. It\x03\n"
            "\x02should not be entirely clear to the audience\x03\n"
            "\x02as whether this is the play or a pre-curtain\x03\n"
            "\x02speech.\x03"
        )
        out = normalize_play_pdf_text(raw)
        assert out.count("[_") == 1
        assert "House lights are up as TROY appears. It should not be" in out

    def test_a_direction_between_two_speeches_does_not_swallow_them(self):
        raw = (
            "TROY\nFirst thing: Troy McDaniel, city police fourteen years.\n"
            "\x02As TROY continues he takes the eyeglasses.\x03\n"
            "TROY\nHappen to be carrying personal firearms."
        )
        out = normalize_play_pdf_text(raw).splitlines()
        assert out[0] == "TROY"
        assert "First thing: Troy McDaniel" in out[1]
        assert out[2].startswith("[_As TROY continues")
        assert out[3] == "TROY"

    def test_no_control_characters_survive(self):
        raw = "\x02Then.\x03\nTROY\n\x02Al-right!\x03 Well!\n\x02He exits.\x03"
        out = normalize_play_pdf_text(raw)
        assert "\x02" not in out and "\x03" not in out


class TestPageFurniture:
    def test_running_header_is_dropped(self):
        raw = 'ACT ONE.\n“Shooter” – ACT ONE\nSCENE 1.'
        out = normalize_play_pdf_text(raw)
        assert "ACT ONE." in out
        assert "“Shooter”" not in out

    def test_page_number_and_copyright_footer_are_dropped(self):
        raw = "A real line of dialogue.\n12\nv_3_2018 © 2016, All Rights Reserved.\nAnother line."
        out = normalize_play_pdf_text(raw)
        assert "A real line of dialogue." in out and "Another line." in out
        assert "All Rights Reserved" not in out
        assert "\n12\n" not in out

    def test_a_number_inside_dialogue_is_not_furniture(self):
        # Only a line that is NOTHING but a number is a page number.
        out = normalize_play_pdf_text("I was discharged after 14 years.")
        assert "I was discharged after 14 years." in out


class TestYear:
    def test_copyright_line_wins(self):
        y, basis = year_from_text(
            "v_3_2018 © 2016, All Rights Reserved.",
            url="https://samgraber.com/wp-content/uploads/2019/05/x.pdf",
        )
        assert (y, basis) == (2016, "copyright_line")

    def test_upload_path_is_a_flagged_fallback(self):
        y, basis = year_from_text(
            "no notice here",
            url="https://samgraber.com/wp-content/uploads/2019/05/x.pdf",
        )
        assert (y, basis) == (2019, "upload_path")

    def test_no_year_is_reported_not_guessed(self):
        assert year_from_text("nothing", url="https://x/y.pdf") == (None, "none")


class TestInlineFurniture:
    """A speech that crosses a page break gets the next header spliced into it."""

    def test_page_header_inside_a_paragraph_is_removed(self):
        raw = (
            "Which! Brings us tonight’s entertainment! "
            "Page 6 “Everything’s Free!” Fantastic liver."
        )
        out = normalize_play_pdf_text(raw)
        assert "Page 6" not in out
        assert "Everything’s Free!”" not in out
        assert "tonight’s entertainment!" in out and "Fantastic liver." in out

    def test_act_header_inside_a_paragraph_is_removed(self):
        raw = "so I told him no. “Shooter” – ACT TWO and then he left."
        out = normalize_play_pdf_text(raw)
        assert "ACT TWO" not in out
        assert "so I told him no." in out and "and then he left." in out

    def test_a_quoted_phrase_in_dialogue_survives(self):
        # No page number and no ACT, so it is speech, not furniture.
        raw = "He actually said “I am fine” and walked out."
        out = normalize_play_pdf_text(raw)
        assert "“I am fine”" in out

    def test_copyright_footer_inside_a_paragraph_is_removed(self):
        raw = "Brings us tonight\u2019s entertainment! v 4 2016 \u00a9 2015, All Rights Reserved. Fantastic liver."
        out = normalize_play_pdf_text(raw)
        assert "All Rights Reserved" not in out
        assert "tonight\u2019s entertainment!" in out and "Fantastic liver." in out

    def test_a_capitalised_word_after_a_footer_is_kept(self):
        # It is the first word of the stage direction, not a reprinted cue.
        raw = "entertainment! v 4 2016 \u00a9 2015, All Rights Reserved. CLUTCH takes out a card."
        out = normalize_play_pdf_text(raw)
        assert "CLUTCH takes out a card." in out


class TestPageBreakBlock:
    """The whole block a page break emits between a speech and a direction."""

    def test_the_block_is_removed_and_the_direction_survives_it(self):
        raw = (
            "still relish a nice swipe of plastic. Which! Brings us tonight\u2019s entertainment!\n"
            "v_4_2016 \u00a9 2015, All Rights Reserved.\n"
            "Page 6\n"
            "\n"
            "\u201cEverything\u2019s Free!\u201d\n"
            "\x02CLUTCH takes out several more credit\x03\n"
            "\x02cards.\x03\n"
            "TYLER\n"
            "Credit cards."
        )
        out = normalize_play_pdf_text(raw)
        # the direction is a direction, joined, and NOT spliced into the speech
        assert "[_CLUTCH takes out several more credit cards._]" in out
        assert "Page 6" not in out and "All Rights Reserved" not in out
        assert "tonight\u2019s entertainment!" in out
        assert "TYLER" in out and "Credit cards." in out

    def test_bare_quoted_title_line_is_dropped(self):
        out = normalize_play_pdf_text("real line\n\u201cEverything\u2019s Free!\u201d\nanother real line")
        assert "Everything\u2019s Free!" not in out
        assert "real line" in out and "another real line" in out

    def test_byline_header_and_reprinted_cue_are_removed(self):
        raw = (
            "No seriously man I’ve had it. "
            "“5 Scripts for 50 Ways” by Sam Graber DERRICK "
            "I am done with this team."
        )
        out = normalize_play_pdf_text(raw)
        assert "Sam Graber" not in out and "DERRICK" not in out
        assert "No seriously man I’ve had it." in out
        assert "I am done with this team." in out

    def test_by_without_a_quoted_title_is_left_alone(self):
        raw = "It was written by Sam Graber and I loved it."
        out = normalize_play_pdf_text(raw)
        assert "written by Sam Graber and I loved it." in out

    def test_byline_header_on_its_own_line_is_dropped(self):
        raw = "real line\n“5 Scripts for 50 Ways” by Sam Graber\nanother real line"
        out = normalize_play_pdf_text(raw)
        assert "Sam Graber" not in out
        assert "real line" in out and "another real line" in out
