import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

from app.services.rehearsal import access


class Access(unittest.TestCase):
    def _check(self, benefits, scene, script=None, user_id=1):
        with mock.patch.object(access, "get_effective_benefits", return_value=benefits), \
             mock.patch.object(access, "_subscription", return_value=None):
            access.assert_can_rehearse(db=None, user=SimpleNamespace(id=user_id), scene=scene, script=script)

    def test_plus_can_rehearse_anything(self):
        self._check({"scene_partner_trial_only": False}, SimpleNamespace(is_library=True, title="X"))

    def test_free_starter_library_scene_allowed(self):
        title = next(iter(access.FREE_LIBRARY_SCENE_TITLES))
        self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=True, title=title))

    def test_free_full_library_scene_refused(self):
        with self.assertRaises(HTTPException) as cm:
            self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=True, title="Not in the set"))
        self.assertEqual(cm.exception.detail["error"], "library_upgrade_required")

    def test_free_own_script_allowed(self):
        self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=False, title="Mine"),
                    script=SimpleNamespace(is_sample=False, title="Mine", user_id=1))


class DirectorNoteGate(unittest.TestCase):
    """The actor's own note on a partner part is Plus."""

    def _can(self, benefits, email="a@example.com"):
        with mock.patch.object(access, "get_effective_benefits", return_value=benefits), \
             mock.patch.object(access, "_subscription", return_value=None), \
             mock.patch("app.core.config.settings.superuser_emails", "boss@example.com"):
            return access.can_direct_partner(db=None, user=SimpleNamespace(id=1, email=email))

    def test_plus_and_pro_have_unlimited_runs_and_may_direct(self):
        self.assertTrue(self._can({"scene_partner_sessions": -1}))

    def test_free_and_solo_may_not(self):
        self.assertFalse(self._can({"scene_partner_sessions": 1, "scene_partner_trial_only": True}))
        self.assertFalse(self._can({"scene_partner_sessions": 3}))
        self.assertFalse(self._can({}))

    def test_an_explicit_feature_wins_either_way(self):
        self.assertTrue(self._can({"scene_partner_sessions": 1, "partner_direction": True}))
        self.assertFalse(self._can({"scene_partner_sessions": -1, "partner_direction": False}))

    def test_a_superuser_may(self):
        self.assertTrue(self._can({"scene_partner_sessions": 1}, email="Boss@example.com"))
