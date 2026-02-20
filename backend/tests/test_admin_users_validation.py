import unittest

from pydantic import ValidationError

from app.api.admin.users import (
    AdminBenefitPatchRequest,
    AdminProfilePatchRequest,
    AdminRolesPatchRequest,
    AdminSubscriptionPatchRequest,
)


class AdminUsersValidationTests(unittest.TestCase):
    def test_profile_note_is_required(self):
        with self.assertRaises(ValidationError):
            AdminProfilePatchRequest(note="x")

    def test_subscription_note_is_required(self):
        with self.assertRaises(ValidationError):
            AdminSubscriptionPatchRequest(note="ok")

    def test_roles_note_is_required(self):
        with self.assertRaises(ValidationError):
            AdminRolesPatchRequest(note="")

    def test_benefit_override_type_validation(self):
        with self.assertRaises(ValidationError):
            AdminBenefitPatchRequest(
                feature_key="scene_partner_sessions",
                override_type="invalid",
                note="valid reason",
            )

    def test_valid_payloads(self):
        profile = AdminProfilePatchRequest(name="New Name", note="Manual admin correction")
        self.assertEqual(profile.name, "New Name")

        sub = AdminSubscriptionPatchRequest(tier_id=1, note="Support migration")
        self.assertEqual(sub.tier_id, 1)

        roles = AdminRolesPatchRequest(is_moderator=True, note="Granting moderation access")
        self.assertTrue(roles.is_moderator)

        benefit = AdminBenefitPatchRequest(
            feature_key="scene_partner_sessions",
            override_type="set",
            value=5,
            note="Goodwill grant",
        )
        self.assertEqual(benefit.value, 5)


if __name__ == "__main__":
    unittest.main()
