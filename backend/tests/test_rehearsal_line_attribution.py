"""Tests for attributing a delivered line to the right scene line.

Prod bug (2026-07-29, reported by Ayush): `rehearsal_sessions.current_line_index`
was used as TWO different things at once —

  * `current_line = all_lines[current_index]`      → an index into ALL lines
  * `session.current_line_index = current_index+1` → bumped once per USER delivery

The client only POSTs /rehearse/deliver on the actor's OWN lines, so the counter
walked 1,2,3,4… while the array it indexed held user + AI lines interleaved. Every
delivery after the first was filed against the wrong scene line.

Measured in prod before the fix: 147 of 304 deliveries (48%) across 50 sessions and
22 users were attributed to a line the actor never spoke.

Two knock-on effects:
  * per-line delivery history (and anything reading it) was garbage
  * completion compared that counter against the user's own line count, so on
    scene 870 — where the extractor split one character into "Daniel" (4 lines)
    and "Dan" (17 lines) — picking "Daniel" ended the 43-line scene after 4 lines
    and dumped the actor into the review screen, which replayed the whole scene
    with AI voices.
"""

import unittest

from app.api.scenes import (
    count_user_lines_delivered,
    resolve_delivered_line_index,
)


# Scene 871 "Words of Wisdom" shape: the actor plays Steve, who speaks at
# positions 0, 4, 5, 7, 9 with other characters interleaved between.
SCENE_871 = ["Steve", "Moeketsi", "Dan", "Moeketsi", "Steve",
             "Steve", "Moeketsi", "Steve", "Moeketsi", "Steve"]
IDS_871 = [500, 501, 502, 503, 504, 505, 506, 507, 508, 509]


class ResolveDeliveredLineIndexTests(unittest.TestCase):
    def test_client_supplied_line_id_wins(self):
        # The client knows exactly which line is on screen. Trust it.
        self.assertEqual(
            resolve_delivered_line_index(
                SCENE_871, IDS_871, "Steve", current_index=0, requested_line_id=507
            ),
            7,
        )

    def test_unknown_line_id_falls_back_to_scanning(self):
        # An id from another scene must not be trusted blindly.
        self.assertEqual(
            resolve_delivered_line_index(
                SCENE_871, IDS_871, "Steve", current_index=1, requested_line_id=99999
            ),
            4,
        )

    def test_walks_the_users_own_lines_not_every_line(self):
        # The regression, end to end: four deliveries with no client line id must
        # land on Steve's lines (0, 4, 5, 7), NOT on positions 0, 1, 2, 3.
        landed = []
        idx = 0
        for _ in range(4):
            hit = resolve_delivered_line_index(SCENE_871, IDS_871, "Steve", idx, None)
            landed.append(hit)
            idx = hit + 1
        self.assertEqual(landed, [0, 4, 5, 7])
        self.assertTrue(all(SCENE_871[i] == "Steve" for i in landed))

    def test_skips_ai_lines_between_user_lines(self):
        self.assertEqual(
            resolve_delivered_line_index(SCENE_871, IDS_871, "Steve", 1, None), 4
        )

    def test_character_match_is_case_and_space_tolerant(self):
        self.assertEqual(
            resolve_delivered_line_index(SCENE_871, IDS_871, "  steve ", 1, None), 4
        )

    def test_returns_none_past_the_last_user_line(self):
        self.assertIsNone(
            resolve_delivered_line_index(SCENE_871, IDS_871, "Steve", 10, None)
        )

    def test_returns_none_when_character_has_no_lines(self):
        # Scene 871's declared character_1_name was "Steve Komphela" while the
        # lines say "Steve" — that session got zero lines.
        self.assertIsNone(
            resolve_delivered_line_index(SCENE_871, IDS_871, "Steve Komphela", 0, None)
        )

    def test_empty_scene_is_safe(self):
        self.assertIsNone(resolve_delivered_line_index([], [], "Steve", 0, None))

    def test_negative_current_index_is_clamped(self):
        self.assertEqual(
            resolve_delivered_line_index(SCENE_871, IDS_871, "Steve", -5, None), 0
        )


class CountUserLinesDeliveredTests(unittest.TestCase):
    """Completion counts DISTINCT user lines covered, so retries don't inflate it."""

    USER_LINE_IDS = [500, 504, 505, 507, 509]

    def test_counts_distinct_user_lines(self):
        self.assertEqual(
            count_user_lines_delivered([500, 504, 505], self.USER_LINE_IDS), 3
        )

    def test_retrying_the_same_line_counts_once(self):
        # Session 303 abandoned at 83% after retries — retries are not progress.
        self.assertEqual(
            count_user_lines_delivered([500, 500, 500, 504], self.USER_LINE_IDS), 2
        )

    def test_ignores_deliveries_against_lines_that_are_not_the_users(self):
        # Legacy sessions carry misattributed AI-line ids from the old bug.
        self.assertEqual(
            count_user_lines_delivered([500, 501, 502, 504], self.USER_LINE_IDS), 2
        )

    def test_full_coverage(self):
        self.assertEqual(
            count_user_lines_delivered(self.USER_LINE_IDS, self.USER_LINE_IDS), 5
        )

    def test_no_deliveries(self):
        self.assertEqual(count_user_lines_delivered([], self.USER_LINE_IDS), 0)


class PrematureCompletionRegressionTests(unittest.TestCase):
    """Scene 870: 43 lines, actor picked the 4-line half of a split character."""

    def test_split_character_no_longer_completes_the_scene_early(self):
        from app.api.scenes import _compute_completion

        # Ayush delivered 4 lines as "Daniel". Under the old code the counter hit
        # user_line_count and the whole 43-line scene was declared finished.
        # With both halves selectable (see multi-role), his real line count is 21.
        pct, done = _compute_completion(total_delivered=4, user_line_count=21)
        self.assertFalse(done)
        self.assertAlmostEqual(pct, 19.0, places=0)


if __name__ == "__main__":
    unittest.main()
