"""Tests for rehearsing more than one role in a scene.

Asked for by Ayush (2026-07-29): "It would also be nice to be able to choose how
many roles we want to speak for, instead of being forced to only choose one."

It also rescues two parsing problems that can't be fixed safely at the source:

  * a character written two ways ("Daniel" early, "Dan" later) can simply be
    selected as both, instead of handing the actor a 4-line part in a 43-line scene
  * a joint cue ("MOEKETSI AND DAN:") is a line for BOTH of those characters, so
    whoever plays either one owns it
"""

import unittest

from app.services.character_names import line_belongs_to, resolve_rehearsal_roles


KNOWN_870 = ["Moeketsi", "Daniel", "Dan"]
KNOWN_871 = ["Steve", "Moeketsi", "Dan", "Moeketsi and Dan"]


class LineOwnershipTests(unittest.TestCase):
    def test_single_role_owns_only_its_own_lines(self):
        self.assertTrue(line_belongs_to("Dan", ["Dan"], KNOWN_870))
        self.assertFalse(line_belongs_to("Moeketsi", ["Dan"], KNOWN_870))

    def test_two_roles_own_both_sets_of_lines(self):
        # The split-character rescue: pick both halves, get the whole part.
        roles = ["Dan", "Daniel"]
        self.assertTrue(line_belongs_to("Dan", roles, KNOWN_870))
        self.assertTrue(line_belongs_to("Daniel", roles, KNOWN_870))
        self.assertFalse(line_belongs_to("Moeketsi", roles, KNOWN_870))

    def test_ownership_is_case_and_space_tolerant(self):
        self.assertTrue(line_belongs_to("  dan ", ["DAN"], KNOWN_870))

    def test_joint_cue_belongs_to_each_participant(self):
        self.assertTrue(line_belongs_to("Moeketsi and Dan", ["Dan"], KNOWN_871))
        self.assertTrue(line_belongs_to("Moeketsi and Dan", ["Moeketsi"], KNOWN_871))

    def test_joint_cue_does_not_belong_to_an_outsider(self):
        self.assertFalse(line_belongs_to("Moeketsi and Dan", ["Steve"], KNOWN_871))

    def test_no_roles_selected_owns_nothing(self):
        self.assertFalse(line_belongs_to("Dan", [], KNOWN_870))

    def test_unknown_character_list_still_matches_directly(self):
        # Without a known-character list, fall back to plain name matching.
        self.assertTrue(line_belongs_to("Dan", ["Dan"], []))
        self.assertFalse(line_belongs_to("Moeketsi and Dan", ["Dan"], []))


class ResolveRehearsalRolesTests(unittest.TestCase):
    LINES_871 = ["Steve", "Moeketsi", "Dan", "Moeketsi and Dan"]
    DECLARED_871 = ("Steve Komphela", "Moeketsi")

    def test_single_choice_still_works(self):
        roles, ai = resolve_rehearsal_roles(
            ["Steve"], self.LINES_871, self.DECLARED_871
        )
        self.assertEqual(roles, ["Steve"])
        self.assertIn(ai, self.LINES_871)

    def test_multiple_choices_all_resolve(self):
        roles, _ = resolve_rehearsal_roles(
            ["Dan", "Daniel"], ["Moeketsi", "Dan", "Daniel"], ("Moeketsi", "Dan")
        )
        self.assertEqual(sorted(roles), ["Dan", "Daniel"])

    def test_declared_display_name_resolves_to_the_cue_name(self):
        roles, _ = resolve_rehearsal_roles(
            ["Steve Komphela"], self.LINES_871, self.DECLARED_871
        )
        self.assertEqual(roles, ["Steve"])

    def test_ai_character_is_someone_the_actor_is_not_playing(self):
        roles, ai = resolve_rehearsal_roles(
            ["Steve", "Dan"], self.LINES_871, self.DECLARED_871
        )
        self.assertNotIn(ai, roles)

    def test_duplicate_choices_are_collapsed(self):
        roles, _ = resolve_rehearsal_roles(
            ["Steve", "steve", " STEVE "], self.LINES_871, self.DECLARED_871
        )
        self.assertEqual(roles, ["Steve"])

    def test_all_invalid_choices_is_rejected(self):
        self.assertIsNone(
            resolve_rehearsal_roles(["Nobody"], self.LINES_871, self.DECLARED_871)
        )

    def test_empty_choice_list_is_rejected(self):
        self.assertIsNone(
            resolve_rehearsal_roles([], self.LINES_871, self.DECLARED_871)
        )

    def test_playing_every_character_still_yields_an_ai_fallback(self):
        # Nothing left for the reader — must not crash or return None.
        roles, ai = resolve_rehearsal_roles(
            ["Steve", "Moeketsi", "Dan"], ["Steve", "Moeketsi", "Dan"],
            ("Steve", "Moeketsi"),
        )
        self.assertEqual(len(roles), 3)
        self.assertIsInstance(ai, str)


class SplitCharacterRescueTests(unittest.TestCase):
    """The scene 870 regression, expressed as line counts."""

    SCENE_870 = ["Moeketsi"] * 22 + ["Daniel"] * 4 + ["Dan"] * 17

    def test_picking_one_half_owns_only_that_half(self):
        owned = [l for l in self.SCENE_870 if line_belongs_to(l, ["Daniel"], KNOWN_870)]
        self.assertEqual(len(owned), 4)

    def test_picking_both_halves_owns_the_whole_part(self):
        owned = [
            l for l in self.SCENE_870
            if line_belongs_to(l, ["Daniel", "Dan"], KNOWN_870)
        ]
        self.assertEqual(len(owned), 21)


if __name__ == "__main__":
    unittest.main()
