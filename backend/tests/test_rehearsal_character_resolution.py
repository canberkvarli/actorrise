"""Tests for tolerant character resolution when starting a rehearsal.

Prod bug (2026-07-23, scene 868 / user Ayush): a scene's designated
character_1/2_name were stored title-cased from AI metadata ("Ryan"/"Rachel")
while the parser wrote the line cues all-caps ("RYAN"/"RACHEL"). The "You're
playing" picker is built from the line-cue names, so the actor picked "RYAN",
but rehearse/start validated the choice with an EXACT match against the declared
names and returned 400 "Invalid character choice".

The resolver matches case/whitespace-insensitively and returns BOTH names in the
exact casing the LINES use, because rehearsal playback + first-line lookup match
against line.character_name (store the wrong casing and the actor gets zero lines).
"""

import unittest

from app.api.scenes import resolve_rehearsal_characters


class RehearsalCharacterResolutionTests(unittest.TestCase):
    LINES = ["RYAN", "RACHEL"]
    DECLARED = ("Ryan", "Rachel")  # title-cased, as AI metadata stored them

    def test_line_cased_pick_resolves_and_is_not_rejected(self):
        # The exact regression: picker sends the all-caps line name.
        self.assertEqual(
            resolve_rehearsal_characters("RYAN", self.LINES, self.DECLARED),
            ("RYAN", "RACHEL"),
        )

    def test_other_character_pick(self):
        self.assertEqual(
            resolve_rehearsal_characters("RACHEL", self.LINES, self.DECLARED),
            ("RACHEL", "RYAN"),
        )

    def test_declared_casing_pick_resolves_to_line_casing(self):
        # If a client sends the declared (title) casing, both names still come
        # back in the LINE casing so downstream line matching works.
        self.assertEqual(
            resolve_rehearsal_characters("Ryan", self.LINES, self.DECLARED),
            ("RYAN", "RACHEL"),
        )

    def test_whitespace_is_tolerated(self):
        self.assertEqual(
            resolve_rehearsal_characters("  ryan ", self.LINES, self.DECLARED),
            ("RYAN", "RACHEL"),
        )

    def test_genuinely_invalid_choice_is_rejected(self):
        self.assertIsNone(
            resolve_rehearsal_characters("Bob", self.LINES, self.DECLARED)
        )

    def test_falls_back_to_declared_when_lines_empty(self):
        # No lines yet: resolve against the declared pair instead of failing.
        self.assertEqual(
            resolve_rehearsal_characters("Ryan", [], self.DECLARED),
            ("Ryan", "Rachel"),
        )

    def test_already_consistent_casing_is_unaffected(self):
        # The common case where declared == line casing must keep working.
        self.assertEqual(
            resolve_rehearsal_characters("RYAN", self.LINES, self.LINES),
            ("RYAN", "RACHEL"),
        )


if __name__ == "__main__":
    unittest.main()
