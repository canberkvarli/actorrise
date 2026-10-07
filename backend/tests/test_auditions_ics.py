import unittest
from datetime import datetime, timezone

from app.models.audition import Audition
from app.services.auditions import ics

NOW = datetime(2026, 10, 7, 15, 0, tzinfo=timezone.utc)


class IcsTests(unittest.TestCase):
    def test_timed_and_all_day(self):
        timed = Audition(id=1, project="The Glass Menagerie", role="Laura", kind="in_person", status="callback",
                         starts_at=datetime(2026, 10, 9, 14, 40, tzinfo=timezone.utc), tz="America/New_York",
                         location="Ripley Grier, 16C", casting="Telsey; Co", bring="sides")
        tape = Audition(id=2, project="Untitled Pilot", kind="self_tape", status="scheduled",
                        due_at=datetime(2026, 10, 12, 21, 0, tzinfo=timezone.utc), tz="America/New_York")
        out = ics.build_calendar([timed, tape], now=NOW, site="https://actorrise.com")
        self.assertTrue(out.startswith("BEGIN:VCALENDAR\r\n"))
        self.assertTrue(out.endswith("END:VCALENDAR\r\n"))
        self.assertIn("UID:audition-1@actorrise.com", out)
        self.assertIn("DTSTAMP:20261007T150000Z", out)
        self.assertIn("DTSTART:20261009T144000Z", out)
        self.assertIn("DTEND:20261009T154000Z", out)
        self.assertIn("SUMMARY:Callback: The Glass Menagerie (Laura)", out)
        self.assertIn("LOCATION:Ripley Grier\\, 16C", out)
        self.assertIn("Casting: Telsey\\; Co", out)
        self.assertIn("DTSTART;VALUE=DATE:20261012", out)
        self.assertIn("DTEND;VALUE=DATE:20261013", out)
        self.assertIn("SUMMARY:Tape due 5:00 PM: Untitled Pilot", out)

    def test_lines_are_folded(self):
        a = Audition(id=3, project="P" * 200, kind="in_person", status="scheduled",
                     starts_at=datetime(2026, 10, 9, 14, 0, tzinfo=timezone.utc), tz="UTC")
        out = ics.build_calendar([a], now=NOW, site="https://a")
        lines = out.split("\r\n")
        for line in lines:
            self.assertLessEqual(len(line.encode()), 75)
        self.assertTrue(any(l.startswith(" ") for l in lines))
        self.assertNotIn("\n", out.replace("\r\n", ""))

    def test_multibyte_fold_keeps_characters_whole(self):
        a = Audition(id=4, project="é" * 120, kind="in_person", status="scheduled",
                     starts_at=datetime(2026, 10, 9, 14, 0, tzinfo=timezone.utc), tz="UTC")
        out = ics.build_calendar([a], now=NOW, site="https://a")
        for line in out.split("\r\n"):
            self.assertLessEqual(len(line.encode()), 75)
        unfolded = out.replace("\r\n ", "")
        self.assertIn("SUMMARY:Audition: " + "é" * 120, unfolded)

    def test_escapes_backslash_and_newline(self):
        a = Audition(id=5, project="A\\B", kind="in_person", status="scheduled", bring="sides\nheadshot",
                     starts_at=datetime(2026, 10, 9, 14, 0, tzinfo=timezone.utc), tz="UTC")
        unfolded = ics.build_calendar([a], now=NOW, site="https://a").replace("\r\n ", "")
        self.assertIn("SUMMARY:Audition: A\\\\B", unfolded)
        self.assertIn("Bring: sides\\nheadshot", unfolded)

    def test_undated_skipped_and_due_only_in_person_does_not_crash(self):
        undated = Audition(id=6, project="X", kind="in_person", status="scheduled", tz="UTC")
        due_only = Audition(id=7, project="Y", kind="in_person", status="scheduled", tz="UTC",
                            due_at=datetime(2026, 10, 12, 21, 0, tzinfo=timezone.utc))
        out = ics.build_calendar([undated, due_only], now=NOW, site="https://a")
        self.assertNotIn("audition-6@", out)
        self.assertIn("audition-7@", out)
        self.assertIn("SUMMARY:Due 9:00 PM: Y", out)
        self.assertNotIn("Tape due: Y", out)
        self.assertIn("REFRESH-INTERVAL;VALUE=DURATION:PT1H", out)
        self.assertIn("X-PUBLISHED-TTL:PT1H", out)


if __name__ == "__main__":
    unittest.main()
