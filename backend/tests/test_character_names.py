"""Tests for speaker-label canonicalization on uploaded scripts.

Prod bug (2026-07-29, Ayush's "Champions for Change" upload):

  scene 870 "Gym Banter" speakers → Moeketsi (22), Daniel (4), Dan (17)
  scene 871 "Words of Wisdom"     → Steve (13), Moeketsi (9), Dan (4),
                                    "Moeketsi and Dan" (1)
  scene 871 declared character_1_name = "Steve Komphela", lines say "Steve"

Three separate defects in how speaker cues become characters:

  1. One person written two ways ("Daniel" early, "Dan" later) becomes two
     characters. Picking the 4-line half ended a 43-line scene after 4 lines.
  2. A joint cue ("MOEKETSI AND DAN:") becomes a phantom character — it also
     crowded the editor header into overlapping itself.
  3. The AI-derived display name ("Steve Komphela") doesn't match the cue name
     ("Steve"), so a session started against it gets zero lines.

Merging is deliberately split into what is SAFE to do silently versus what may
only be SUGGESTED. Silently merging two genuinely different characters is worse
than leaving them apart, so nickname-shaped pairs are suggested, never applied.
"""

import unittest

from app.services.character_names import (
    canonical_character_map,
    canonicalize_scene_characters,
    split_compound_speaker,
    suggest_character_merges,
)


class CanonicalCharacterMapTests(unittest.TestCase):
    """Only unambiguous variants are folded together automatically."""

    def test_case_and_whitespace_variants_merge(self):
        mapping = canonical_character_map(["RYAN", "Ryan", " ryan "])
        self.assertEqual(len({mapping[n] for n in mapping}), 1)

    def test_canonical_form_is_the_most_used_spelling(self):
        # The cue casing the lines actually use must win — rehearsal matches on it.
        mapping = canonical_character_map(
            ["RYAN", "Ryan"], line_counts={"RYAN": 11, "Ryan": 0}
        )
        self.assertEqual(mapping["Ryan"], "RYAN")
        self.assertEqual(mapping["RYAN"], "RYAN")

    def test_continuation_and_voiceover_suffixes_merge_into_the_base_name(self):
        mapping = canonical_character_map(
            ["DAN", "DAN (CONT'D)", "DAN (V.O.)", "DAN (O.S.)"],
            line_counts={"DAN": 17},
        )
        self.assertEqual({mapping[n] for n in mapping}, {"DAN"})

    def test_full_name_containment_merges_to_the_cue_name(self):
        # Scene 871: declared "Steve Komphela", cues say "Steve".
        mapping = canonical_character_map(
            ["Steve", "Steve Komphela"], line_counts={"Steve": 13, "Steve Komphela": 0}
        )
        self.assertEqual(mapping["Steve Komphela"], "Steve")
        self.assertEqual(mapping["Steve"], "Steve")

    def test_trailing_punctuation_is_ignored(self):
        mapping = canonical_character_map(["Dan", "Dan:"])
        self.assertEqual(len({mapping[n] for n in mapping}), 1)

    def test_nickname_pairs_are_NOT_merged_silently(self):
        # Dan/Daniel is a real merge, but so is Ann/Anna a real SPLIT. Too risky
        # to guess — this is what suggest_character_merges() is for.
        mapping = canonical_character_map(
            ["Dan", "Daniel"], line_counts={"Dan": 17, "Daniel": 4}
        )
        self.assertNotEqual(mapping["Dan"], mapping["Daniel"])

    def test_distinct_characters_are_left_alone(self):
        names = ["Moeketsi", "Dan", "Steve"]
        mapping = canonical_character_map(names)
        self.assertEqual(len({mapping[n] for n in names}), 3)

    def test_compound_cue_is_not_folded_into_a_participant(self):
        mapping = canonical_character_map(["Moeketsi", "Dan", "Moeketsi and Dan"])
        self.assertNotEqual(mapping["Moeketsi and Dan"], mapping["Dan"])

    def test_empty_input(self):
        self.assertEqual(canonical_character_map([]), {})


class SplitCompoundSpeakerTests(unittest.TestCase):
    """A joint cue is a line for several characters, not a character."""

    KNOWN = ["Moeketsi", "Dan", "Steve"]

    def test_and_cue_splits_into_participants(self):
        self.assertEqual(
            split_compound_speaker("Moeketsi and Dan", self.KNOWN), ["Moeketsi", "Dan"]
        )

    def test_ampersand_cue_splits(self):
        self.assertEqual(
            split_compound_speaker("MOEKETSI & DAN", self.KNOWN), ["Moeketsi", "Dan"]
        )

    def test_slash_and_comma_cues_split(self):
        self.assertEqual(
            split_compound_speaker("Steve/Dan", self.KNOWN), ["Steve", "Dan"]
        )
        self.assertEqual(
            split_compound_speaker("Steve, Dan", self.KNOWN), ["Steve", "Dan"]
        )

    def test_three_way_cue_splits(self):
        self.assertEqual(
            split_compound_speaker("Steve, Moeketsi and Dan", self.KNOWN),
            ["Steve", "Moeketsi", "Dan"],
        )

    def test_plain_character_is_not_compound(self):
        self.assertIsNone(split_compound_speaker("Moeketsi", self.KNOWN))

    def test_unknown_participants_are_not_treated_as_compound(self):
        # "Sandra and the dog" isn't a joint cue for known characters.
        self.assertIsNone(split_compound_speaker("Sandra and the dog", self.KNOWN))

    def test_character_whose_name_contains_and_is_not_split(self):
        self.assertIsNone(split_compound_speaker("Anderson", self.KNOWN))


class SuggestCharacterMergesTests(unittest.TestCase):
    """Surfaced to the actor as 'these look like the same character' prompts."""

    def test_suggests_the_dan_daniel_split(self):
        suggestions = suggest_character_merges(
            ["Moeketsi", "Daniel", "Dan"], line_counts={"Moeketsi": 22, "Dan": 17, "Daniel": 4}
        )
        pairs = {frozenset(s) for s in suggestions}
        self.assertIn(frozenset({"Dan", "Daniel"}), pairs)

    def test_does_not_suggest_unrelated_characters(self):
        suggestions = suggest_character_merges(["Moeketsi", "Steve"], line_counts={})
        self.assertEqual(suggestions, [])

    def test_does_not_suggest_very_short_prefixes(self):
        # "Jo"/"John" is too thin a stem to be worth asking about.
        self.assertEqual(suggest_character_merges(["Jo", "John"], line_counts={}), [])

    def test_does_not_suggest_compound_cues_as_merges(self):
        suggestions = suggest_character_merges(
            ["Moeketsi", "Dan", "Moeketsi and Dan"], line_counts={}
        )
        self.assertEqual(suggestions, [])

    def test_suggestion_puts_the_dominant_spelling_first(self):
        # The editor merges the second into the first, so the keeper leads.
        suggestions = suggest_character_merges(
            ["Daniel", "Dan"], line_counts={"Dan": 17, "Daniel": 4}
        )
        self.assertEqual(suggestions, [("Dan", "Daniel")])


class CanonicalizeSceneCharactersTests(unittest.TestCase):
    """Applied to every scene as it is parsed out of an uploaded script."""

    def test_declared_names_are_rewritten_to_the_cue_names(self):
        # Scene 871's shape: the display name never appears as a cue.
        scene = {
            "character_1": "Steve Komphela",
            "character_2": "Moeketsi",
            "lines": [
                {"character": "Steve", "text": "..."},
                {"character": "Moeketsi", "text": "..."},
                {"character": "Steve", "text": "..."},
            ],
        }
        out = canonicalize_scene_characters(scene)
        self.assertEqual(out["character_1"], "Steve")
        self.assertEqual(out["character_2"], "Moeketsi")

    def test_line_cue_casing_is_standardised(self):
        scene = {
            "character_1": "Ryan",
            "character_2": "Rachel",
            "lines": [
                {"character": "RYAN", "text": "a"},
                {"character": "Ryan", "text": "b"},
                {"character": "RACHEL", "text": "c"},
            ],
        }
        out = canonicalize_scene_characters(scene)
        cues = {l["character"] for l in out["lines"]}
        self.assertEqual(cues, {"RYAN", "RACHEL"})
        self.assertEqual(out["character_1"], "RYAN")

    def test_nickname_split_is_left_intact_for_the_actor_to_confirm(self):
        scene = {
            "character_1": "Moeketsi",
            "character_2": "Dan",
            "lines": [
                {"character": "Daniel", "text": "a"},
                {"character": "Dan", "text": "b"},
                {"character": "Moeketsi", "text": "c"},
            ],
        }
        out = canonicalize_scene_characters(scene)
        cues = {l["character"] for l in out["lines"]}
        self.assertEqual(cues, {"Daniel", "Dan", "Moeketsi"})

    def test_scene_without_lines_is_untouched(self):
        scene = {"character_1": "A", "character_2": "B", "lines": []}
        self.assertEqual(canonicalize_scene_characters(scene), scene)

    def test_original_dict_is_not_mutated(self):
        scene = {
            "character_1": "Steve Komphela",
            "character_2": "Moeketsi",
            "lines": [{"character": "Steve", "text": "..."}],
        }
        canonicalize_scene_characters(scene)
        self.assertEqual(scene["character_1"], "Steve Komphela")

    def test_missing_keys_do_not_raise(self):
        self.assertIsInstance(canonicalize_scene_characters({}), dict)


if __name__ == "__main__":
    unittest.main()
