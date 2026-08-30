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
    has_flattened_scene,
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


# --- flattened dialogue scenes ---------------------------------------------

# #9750, verbatim from prod. Arthur's own lines with Murray's cut out and the
# remainder concatenated backwards through the interview.
JOKER = (
    "Happy?! I'm not happy. I haven't been happy for one minute of my entire "
    "fucking life. \n\nBut you know what's funny? You know what really makes me "
    "laugh? I used to think my life was nothing but a tragedy, but now, now I "
    "realize it's all just a fucking comedy. \n\nYou wanna hear a joke, Murray? "
    "\n\nKnock-knock. \n\nYeah, I don't know if I should cross or uncross 'em. "
    "Both feel completely unnatural. \n\nThanks for having me on, Murray. I "
    "can't tell you how much this means to me, it's been a life long dream. I "
    "have a joke for you— \n\nYou're right. You're right, uncrossed is "
    "better. \n\nYou shouldn't be here. It's not right."
)

# A real 4-paragraph monologue. Must NOT trip the check — fragment count alone
# is not the signal, or Sling Blade and Gladiator go with it.
GOOD_LONG = (
    "It was the strangest thing, I don't know that I can explain it. Two of my "
    "men dead, and all I could think of was whether Kurtz was dead too."
    "\n\nSomething happened out there that I could not put into words."
    "\n\nEvery day I stayed made the river feel longer behind me."
    "\n\nI wanted to see him. That was all I wanted, to see Kurtz."
)


class TestFlattenedScene:
    def test_catches_the_joker_row(self):
        assert has_flattened_scene(JOKER)

    def test_long_real_monologue_survives(self):
        assert not has_flattened_scene(GOOD_LONG)

    def test_fragment_count_alone_is_not_enough(self):
        """Six paragraphs, no orphaned answers — a real speech."""
        text = "\n\n".join([
            "I learned to read some, and I've read on the Bible quite a bit.",
            "I don't understand all of it, but I understand a good deal.",
            "Them stories Mama and you told me ain't in there at all.",
            "You ort not to have told them to me that way.",
            "I reckon I know that now, though it took me a long while.",
            "That is about all I have got to say about it.",
        ])
        assert not has_flattened_scene(text)

    def test_reply_opener_alone_is_not_enough(self):
        """Under the fragment floor, a reply word is just a way to start."""
        assert not has_flattened_scene("Yeah, I remember that day.\n\nIt rained.")

    def test_no_paragraph_breaks_never_fires(self):
        assert not has_flattened_scene("Yeah. " * 200)

    @pytest.mark.parametrize("opener", [
        "Yeah, I don't know.", "You're right, uncrossed is better.",
        "No, don't do that.", "Well, maybe not exactly.",
        "Okay?", "Exactly what I meant.", "Thanks for having me on.",
    ])
    def test_orphaned_answer_shapes(self, opener):
        text = "\n\n".join(["A real opening line that runs on a while.",
                            "Another substantial thought entirely.",
                            "A third one, still going.", opener])
        assert has_flattened_scene(text)

    def test_gate_reports_reason(self):
        r = assess_monologue_quality(JOKER)
        assert "flattened_scene" in r.reasons
        assert not r.ok

    def test_gate_passes_the_good_one(self):
        r = assess_monologue_quality(GOOD_LONG)
        assert "flattened_scene" not in r.reasons


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
        ("", None),
        # Children stay their own bucket — teachers search for this specifically.
        ("Child", "child"),
        ("6-10", "child"),
        ("8-10", "child"),
        ("kid", "child"),
        ("12", "child"),
        ("13", "teens"),             # boundary
        ("Child, Early Teen", "child"),
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
