import unittest
from datetime import date

from app.services import engagement


class EngagedWeeksTests(unittest.TestCase):
    def test_returning_means_seen_in_an_earlier_week(self):
        rows = [
            (1, date(2026, 9, 28)), (1, date(2026, 10, 6)),  # week 1, back week 2
            (2, date(2026, 10, 5)),  # new in week 2
            (3, date(2026, 9, 29)), (3, date(2026, 9, 30)),  # week 1 only
        ]
        weeks = engagement.weekly(rows)
        self.assertEqual(weeks[date(2026, 9, 28)], {"active": 2, "returning": 0})
        self.assertEqual(weeks[date(2026, 10, 5)], {"active": 2, "returning": 1})

    def test_engaged_names_exclude_passive_ones(self):
        self.assertIn("audition_created", engagement.ENGAGED_EVENTS)
        self.assertNotIn("audition_reminder_sent", engagement.ENGAGED_EVENTS)
        self.assertNotIn("email_sent", engagement.ENGAGED_EVENTS)


if __name__ == "__main__":
    unittest.main()
