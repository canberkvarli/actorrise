"""Run it on a monologue's page (2026-10-21): the offer and the tap are counted.

opened -> run was 34% with nothing saying how many openers were ever shown a
way in. These two events make that step a measured one; client_platform is
added to every client event by api/events.with_device.
"""

import unittest

from app.services.events import CLIENT_EVENT_NAMES


class TheEntryIsMeasured(unittest.TestCase):
    def test_shown_and_tapped_are_client_events(self):
        self.assertTrue({"run_entry_shown", "run_entry_tapped"} <= CLIENT_EVENT_NAMES)

    def test_the_start_screen_is_counted(self):
        self.assertIn("run_start_screen_shown", CLIENT_EVENT_NAMES)

    def test_the_read_aloud_event_is_gone(self):
        """The read-aloud step was removed the same day; its event went with it."""
        self.assertNotIn("run_hear_finished", CLIENT_EVENT_NAMES)


if __name__ == "__main__":
    unittest.main()
