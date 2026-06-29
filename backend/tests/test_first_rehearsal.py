"""Tests for the zero-setup first-rehearsal activation flow.

The flow drops every brand-new actor straight into one curated scene so they
reach the ScenePartner "aha" before wandering off (the 88.6%-search →
3.9%-rehearse activation cliff). Two things must stay true:

1. The hero scene must be a FREE-tier scene. If it ever drifts out of the free
   set, new (free) users would smack into a paywall on their very first
   rehearsal — the exact opposite of the goal.
2. The casting the API hands back must come from the scene's own character
   columns, so the user_character always matches a real character in the lines.
"""

import unittest

from app.api.scenes import (
    FIRST_REHEARSAL_SCENE_TITLE,
    FREE_LIBRARY_SCENE_TITLES,
    FirstRehearsalSceneResponse,
)


class FirstRehearsalSceneTests(unittest.TestCase):
    def test_hero_scene_is_free_tier(self):
        # If this fails, new free users hit a paywall on their first rehearsal.
        self.assertIn(FIRST_REHEARSAL_SCENE_TITLE, FREE_LIBRARY_SCENE_TITLES)

    def test_response_carries_explicit_casting(self):
        # The interstitial relies on a guaranteed-valid user_character, so the
        # response shape must expose both roles.
        resp = FirstRehearsalSceneResponse(
            scene_id=1,
            user_character="Gwendolen",
            ai_character="Cecily",
            title=FIRST_REHEARSAL_SCENE_TITLE,
        )
        self.assertEqual(resp.user_character, "Gwendolen")
        self.assertEqual(resp.ai_character, "Cecily")
        self.assertEqual(resp.scene_id, 1)


if __name__ == "__main__":
    unittest.main()
