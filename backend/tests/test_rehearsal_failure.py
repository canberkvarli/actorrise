"""rehearsal_sessions.failure_reason is a closed vocabulary."""

import unittest

from app.services.rehearsal_failure import FAILURE_REASONS, normalize_failure_reason


class NormalizeTests(unittest.TestCase):
    def test_known_values_pass_through(self):
        for reason in FAILURE_REASONS:
            self.assertEqual(normalize_failure_reason(reason), reason)

    def test_case_and_whitespace(self):
        self.assertEqual(normalize_failure_reason("  Mic_Denied "), "mic_denied")

    def test_unknown_is_null_not_error(self):
        self.assertIsNone(normalize_failure_reason("bored"))
        self.assertIsNone(normalize_failure_reason(""))
        self.assertIsNone(normalize_failure_reason(None))
        self.assertIsNone(normalize_failure_reason(42))  # type: ignore[arg-type]

    def test_client_vocabulary_matches(self):
        # The strings the rehearse page's failureReason() can produce.
        client = {
            "load_error", "speech_unsupported", "mic_denied", "speech_unavailable",
            "speech_error", "never_began", "no_lines", "left_midway",
        }
        self.assertEqual(client, set(FAILURE_REASONS))

    def test_column_exists(self):
        from app.models.actor import RehearsalSession

        self.assertIn("failure_reason", RehearsalSession.__table__.c)


if __name__ == "__main__":
    unittest.main()
