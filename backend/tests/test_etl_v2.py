"""ETL v2: rights enforcement, cast-aware interleave gate, metadata normalising."""

from __future__ import annotations

import pytest

from app.services.licensing import (
    EXCERPT_MAX_WORDS,
    may_serve_text,
    may_store_text,
    text_basis,
)
from app.services.extraction.monologue_quality import (
    assess_monologue_quality,
    has_interleaved_dialogue,
    has_stage_direction_residue,
)
from app.services.extraction.source_adapter import (
    fields_needing_inference,
    normalize_age_range,
    normalize_gender,
    normalize_tone,
    resolve_metadata,
)


# --- licensing --------------------------------------------------------------

class TestLicensing:
    def test_public_domain_always_allowed(self):
        assert may_store_text("public_domain", None)
        assert may_store_text("public_domain", "public_domain")

    def test_user_upload_allowed(self):
        assert may_store_text("user_uploaded", "user_content")

    def test_copyrighted_with_basis_allowed(self):
        assert may_store_text("copyrighted", "fair_use")
        assert may_store_text("copyrighted", "licensed")
        assert may_store_text("copyrighted", "cc_by")

    def test_copyrighted_without_basis_refused(self):
        """The 296 StageAgent rows: copyrighted, license_type NULL."""
        assert not may_store_text("copyrighted", None)
        assert not may_store_text("copyrighted", "")

    def test_fails_closed_on_unknown(self):
        assert not may_store_text("unknown", None)
        assert not may_store_text(None, None)
        assert not may_store_text("something_new", "invented_basis")

    def test_fair_use_is_length_bounded(self):
        assert may_store_text("copyrighted", "fair_use", word_count=EXCERPT_MAX_WORDS)
        assert not may_store_text("copyrighted", "fair_use", word_count=EXCERPT_MAX_WORDS + 1)

    def test_explicit_licence_not_length_bounded(self):
        """A signed permission says what it says."""
        assert may_store_text("copyrighted", "licensed", word_count=100_000)

    def test_case_and_whitespace_tolerated(self):
        assert may_store_text("  Public_Domain ", None)

    def test_serve_mirrors_store(self):
        for status, lic in [
            ("public_domain", None),
            ("copyrighted", "fair_use"),
            ("copyrighted", None),
            (None, None),
        ]:
            assert may_serve_text(status, lic) == may_store_text(status, lic)

    def test_basis_labels(self):
        assert text_basis("copyrighted", None) == "copyrighted, no basis recorded"
        assert text_basis("public_domain", None) == "public domain"
        assert text_basis(None, None) == "rights unknown"


# --- cast-aware interleave gate --------------------------------------------

CAST = ["The Sentimental High School Girl", "Rosencrantz", "The Grandmother"]


class TestInterleaveGate:
    def test_detects_midtext_cue(self):
        text = (
            "I walked for hours in the dark and could not find the road. "
            "Rosencrantz. And what did you do then, my lord? "
            "I sat down and waited for the morning."
        )
        assert has_interleaved_dialogue(text, CAST)

    def test_detects_dangling_trailing_label(self):
        """The #7501 bug: the cue label stranded as the final sentence."""
        text = (
            "I should have reached it then, and so it dawned on me that I had "
            "lost my way. The Sentimental High School Girl."
        )
        assert has_interleaved_dialogue(text, CAST)

    def test_clean_monologue_passes(self):
        text = (
            "I should have reached it then, and so it dawned on me that I had "
            "lost my way. The night was cold and the forest was very quiet."
        )
        assert not has_interleaved_dialogue(text, CAST)

    def test_opening_address_is_not_an_interleave(self):
        text = "Rosencrantz. Good my lord, I have news that will not keep till morning."
        assert not has_interleaved_dialogue(text, CAST)

    def test_short_names_do_not_false_positive(self):
        """'Tracy.' as direct address must not read as a cue."""
        text = "I told her the truth, Tracy. And she did not believe a word of it."
        assert not has_interleaved_dialogue(text, ["Tracy", "Oliver"])

    def test_empty_cast_is_a_no_op(self):
        text = "Rosencrantz. And what did you do then? I sat down."
        assert not has_interleaved_dialogue(text, [])

    def test_stage_direction_residue(self):
        assert has_stage_direction_residue("I waited. Enter Rosencrantz. He said nothing.", CAST)

    def test_spoken_enter_survives(self):
        """'Enter' in a line the character actually speaks is not a direction."""
        assert not has_stage_direction_residue(
            "Enter my house and I will show you what my father left me.", CAST
        )

    def test_gate_reports_reason(self):
        text = " ".join(["word"] * 60) + " Rosencrantz. And so I left."
        r = assess_monologue_quality(text, cast=CAST)
        assert "interleaved_dialogue" in r.reasons
        assert not r.ok

    def test_gate_without_cast_is_blind_to_it(self):
        """Documents the pre-existing behaviour: no cast, no cast-aware check."""
        text = " ".join(["word"] * 60) + " Rosencrantz. And so I left."
        r = assess_monologue_quality(text)
        assert "interleaved_dialogue" not in r.reasons


# --- metadata normalising ---------------------------------------------------

class TestNormalizers:
    @pytest.mark.parametrize("raw,expected", [
        ("Female", "female"), ("women", "female"), ("M", "male"),
        ("either gender", "any"), ("Non-Binary", "any"), ("", None), ("wat", None),
    ])
    def test_gender(self, raw, expected):
        assert normalize_gender(raw) == expected

    @pytest.mark.parametrize("raw,expected", [
        ("30-40", "30s"),            # 6,127 rows the age filter cannot match today
        ("20-30", "20s"),            # 2,201 rows
        ("Young Adult", "20s"),
        ("Late Teen", "teens"),
        ("Mature Adult", "50s"),
        ("Elderly", "60+"),
        ("40s", "40s"),
        ("60+", "60+"),
        ("70s", "60+"),              # folds into the top bucket the filter offers
        ("Late Teen, Young Adult", "teens"),   # multi -> youngest
        ("900+", None),              # junk
        ("5", None),
        ("", None),
    ])
    def test_age_range(self, raw, expected):
        assert normalize_age_range(raw) == expected

    def test_every_age_output_is_queryable(self):
        from app.services.extraction.source_adapter import AGE_RANGES
        samples = ["30-40", "Young Adult", "teens", "70s", "60+", "Adult", "20s"]
        for s in samples:
            out = normalize_age_range(s)
            assert out is None or out in AGE_RANGES

    @pytest.mark.parametrize("raw,expected", [
        ("Comic", "comedic"), ("comedy", "comedic"), ("sardonic", "sarcastic"),
        ("dramatic", "dramatic"), ("nonsense", None),
    ])
    def test_tone(self, raw, expected):
        assert normalize_tone(raw) == expected


class TestResolveMetadata:
    def test_source_wins_over_inference(self):
        r = resolve_metadata(
            {"character_gender": "Female"},
            {"character_gender": "male"},
        )
        assert r.values["character_gender"] == "female"
        assert r.provenance["character_gender"] == "source"

    def test_unusable_source_value_falls_back_to_inference(self):
        """'Ageless' is stated but unqueryable, so the guess stands."""
        r = resolve_metadata(
            {"character_age_range": "Ageless"},
            {"character_age_range": "40s"},
        )
        assert r.values["character_age_range"] == "40s"
        assert r.provenance["character_age_range"] == "inferred"

    def test_source_value_is_normalised_not_passed_through(self):
        r = resolve_metadata({"character_age_range": "Young Adult"}, {})
        assert r.values["character_age_range"] == "20s"

    def test_stated_fields_listed(self):
        r = resolve_metadata(
            {"character_gender": "Female", "tone": "Comic"},
            {"character_age_range": "30s"},
        )
        assert r.stated_fields() == ["character_gender", "tone"]

    def test_only_missing_fields_go_to_the_llm(self):
        missing = fields_needing_inference(
            {"character_gender": "Female", "character_age_range": "Ageless"}
        )
        assert "character_gender" not in missing
        assert "character_age_range" in missing   # stated but unusable
        assert "tone" in missing                  # not stated at all
