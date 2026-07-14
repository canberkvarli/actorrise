"""Tests for the profile-first onboarding preference derivations.

The 5-tap onboarding turns an actor's self-description into search levers the
recommender already reads. The one non-trivial derivation is career stage ->
overdone sensitivity: beginners should tolerate recognizable/warhorse pieces
(they want the famous ones), pros should be pushed toward fresh material.
"""

import unittest

from app.services.onboarding_prefs import overdone_sensitivity_for_stage


class OverdoneSensitivityTests(unittest.TestCase):
    def test_beginner_tolerant(self):
        self.assertEqual(overdone_sensitivity_for_stage("just_starting"), 0.2)

    def test_auditioning_balanced(self):
        self.assertEqual(overdone_sensitivity_for_stage("auditioning"), 0.5)

    def test_pro_strict(self):
        self.assertEqual(overdone_sensitivity_for_stage("working_pro"), 0.8)

    def test_unknown_defaults_balanced(self):
        self.assertEqual(overdone_sensitivity_for_stage("???"), 0.5)

    def test_none_defaults_balanced(self):
        self.assertEqual(overdone_sensitivity_for_stage(None), 0.5)


if __name__ == "__main__":
    unittest.main()
