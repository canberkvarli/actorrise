"""Repair of double-struck screenplay glyphs.

A ScriptSlug PDF vintage renders some type double-struck, so pdfplumber emits
each glyph twice: "Dearest Scottie" as "DDeeaarreesstt SSccoottttiiee", the cue
"Gloria" as "Gglloorriiaa". The doubling is uniform and losslessly reversible,
but the detector must not touch a correctly spelled double letter — "Kaffee"
and "Colleen" are real names, not artifacts.
"""

from scripts.repair_doubled_glyphs import (_clean_name, _letter_pairs_match,
                                           dedouble, is_doubled)


class TestDedouble:
    def test_uniform_doubling_collapses(self):
        assert dedouble("DDeeaarreesstt") == "Dearest"
        assert dedouble("SSccoottttiiee") == "Scottie"

    def test_case_insensitive_leading_cap(self):
        # Cues double their capital as cap+lowercase ("Teen" -> "Tteeeenn").
        assert dedouble("Tteeeenn") == "Teen"

    def test_genuine_double_letter_survives(self):
        # "Dutton" doubled is "Dduuttttoonn"; the real "tt" must fold to "tt".
        assert dedouble("Dduuttttoonn") == "Dutton"

    def test_repeated_emphasis_letters_survive(self):
        # "sooo" (emphasis) doubled is "ssoooooo"; folds back to "sooo".
        assert dedouble("ssoooooo") == "sooo"


class TestDetection:
    def test_doubled_name_detected(self):
        assert _letter_pairs_match("Gglloorriiaa") >= 0.9
        assert _letter_pairs_match("SSCCOOTTTTIIEE") >= 0.9

    def test_real_double_letter_name_not_detected(self):
        # The false positives that motivated the 0.9 bar.
        assert _letter_pairs_match("Kaffee") < 0.9
        assert _letter_pairs_match("Colleen") < 0.9

    def test_ordinary_name_not_detected(self):
        assert _letter_pairs_match("Gloria") < 0.9
        assert _letter_pairs_match("John Dutton") < 0.9

    def test_doubled_body_detected(self):
        assert is_doubled("TThhiiss iiss tthhee mmoommeenntt II hhaavvee wwaaiitteedd")

    def test_ordinary_body_not_detected(self):
        assert not is_doubled(
            "This is the moment I have waited for and dreamed of my whole life")


class TestCleanName:
    def test_strips_trailing_cont_marker_and_paren(self):
        assert _clean_name("Gglloorriiaa )") == "Gloria"
        assert _clean_name("Jjoohhnn Dduuttttoonn )") == "John Dutton"

    def test_keeps_voice_suffix(self):
        assert _clean_name("Jjuuddyy''ss Vvooiiccee") == "Judy's Voice"
