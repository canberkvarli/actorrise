"""Section 9 of the conversion brief: what free people use."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from conversion_brief import return_days, upload_funnel_rows, usage_rows  # noqa: E402


class UploadFunnel(unittest.TestCase):
    def test_people_in_funnel_order_real_only(self):
        pairs = [
            ("opened", 1), ("opened", 2), ("opened", 3), ("opened", 99),
            ("started", 1), ("started", 2),
            ("dropped: picker, closed", 2),
            ("met the plan limit: picker", 3),
            ("dropped: scan, http_500", 1),
            ("finished (user_scripts)", 1),
        ]
        self.assertEqual(upload_funnel_rows(pairs, real={1, 2, 3}), [
            ("opened", 3), ("started", 2),
            ("dropped: picker, closed", 1), ("dropped: scan, http_500", 1),
            ("met the plan limit: picker", 1),
            ("finished (user_scripts)", 1),
        ])

    def test_nothing_yet(self):
        self.assertEqual(upload_funnel_rows([], {1}), [])


class UsageRows(unittest.TestCase):
    def test_counts_free_people_only_and_walls_among_them(self):
        per = {"search": {1: 2, 2: 8, 3: 4, 9: 50}}
        free = {1, 2, 3}
        rows = usage_rows(per, free, walled={2, 9}, asked={2}, paying={9})
        # 9 is paying, so not in the free counts, but counted as a payer using it.
        self.assertEqual(rows, [("search", 3, 4, 8, 1, 1, 1)])

    def test_feature_nobody_used(self):
        self.assertEqual(usage_rows({"tape": {}}, set(), set(), set(), set()),
                         [("tape", 0, 0, 0, 0, 0, 0)])

    def test_return_days(self):
        self.assertEqual(return_days({1: 1, 2: 1, 3: 2, 4: 5, 5: 9}, {1, 2, 3, 4}),
                         "2 on 1 day only, 1 on 2 days, 1 on 3 or more")


if __name__ == "__main__":
    unittest.main()
