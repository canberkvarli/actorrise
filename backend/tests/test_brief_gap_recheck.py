"""The brief's "in no tab" list is re-checked against the library today.

content_gap is what the search said at the time, kept 30 days. On 2026-11-03
the brief listed Harry Potter as in no tab while eight film pieces were
searchable (the prefix match shipped Oct 30), and "shiv roy" as a weak search
that had routed to Shiv's Succession pieces since Nov 2.
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from conversion_brief import recheck_absent, recheck_weak  # noqa: E402

CARRIED = {"harry potter": ["film"]}


def carried_now(title):
    return CARRIED.get(title.lower(), [])


class RecheckAbsentTests(unittest.TestCase):
    rows = [
        ("Hamilton", 4, 3, date(2026, 10, 27), False),
        ("Little Shop of Horrors", 7, 3, date(2026, 10, 28), True),
        ("Harry Potter", 3, 2, date(2026, 10, 27), False),
    ]

    def test_title_carried_today_leaves_the_absent_list(self):
        absent, found = recheck_absent(self.rows, carried_now)
        self.assertNotIn("Harry Potter", [r[0] for r in absent])
        self.assertEqual(found, ["Harry Potter (film)"])

    def test_still_missing_titles_stay(self):
        absent, _ = recheck_absent(self.rows, carried_now)
        self.assertEqual([r[0] for r in absent], ["Hamilton", "Little Shop of Horrors"])

    def test_empty_shell_is_labelled(self):
        absent, _ = recheck_absent(self.rows, carried_now)
        notes = {r[0]: r[4] for r in absent}
        self.assertEqual(notes["Little Shop of Horrors"], "listed, no pieces")
        self.assertEqual(notes["Hamilton"], "")


class RecheckWeakTests(unittest.TestCase):
    def test_adds_what_the_query_finds_today(self):
        rows = [("shiv roy", 3, 1, 12), ("manipulator", 3, 1, 20)]
        finds = {"shiv roy": "character Shiv"}
        out = recheck_weak(rows, finds.get)
        self.assertEqual(out[0][-1], "character Shiv")
        self.assertEqual(out[1][-1], "")


if __name__ == "__main__":
    unittest.main()
