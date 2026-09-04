"""Tests for the account_type concept (actor / educator / student).

account_type is deliberately nullable: null means "unknown / legacy", which is
what every pre-existing account is. Nothing backfills it, so every reader has to
tolerate null. These tests pin the two things that are easy to get wrong:

  1. the allowed set is closed (a typo like "teacher" must not silently persist)
  2. null and empty string both mean "unknown", not "invalid"
"""

import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from app.api.admin.users import AdminProfilePatchRequest
from app.api.auth import UpdateOnboardingRequest, update_onboarding
from app.core.account_types import (
    ACCOUNT_TYPE_FILTERS,
    ACCOUNT_TYPES,
    account_type_filter,
    normalize_account_type,
)
from app.models.user import User


class _FakeSession:
    """Just enough Session for the endpoint body: it commits and refreshes."""

    def commit(self):
        pass

    def refresh(self, _obj):
        pass


class NormalizeAccountTypeTests(unittest.TestCase):
    def test_allowed_set_is_the_three_values(self):
        self.assertEqual(set(ACCOUNT_TYPES), {"actor", "educator", "student"})

    def test_accepts_each_good_value(self):
        for value in ("actor", "educator", "student"):
            self.assertEqual(normalize_account_type(value), value)

    def test_accepts_null(self):
        self.assertIsNone(normalize_account_type(None))

    def test_empty_string_clears_to_null(self):
        self.assertIsNone(normalize_account_type("   "))

    def test_normalizes_case_and_whitespace(self):
        self.assertEqual(normalize_account_type("  Educator "), "educator")

    def test_rejects_a_bad_value(self):
        with self.assertRaises(ValueError):
            normalize_account_type("teacher")


class OnboardingAccountTypeTests(unittest.TestCase):
    """The self-serve path: PATCH /api/auth/onboarding."""

    def _patch(self, **body):
        user = User()
        update_onboarding(
            body=UpdateOnboardingRequest(**body),
            current_user=user,
            db=_FakeSession(),
        )
        return user

    def test_accepts_each_good_value(self):
        for value in ("actor", "educator", "student"):
            self.assertEqual(self._patch(account_type=value).account_type, value)

    def test_accepts_null(self):
        # Field omitted entirely — the column is left alone, not written.
        self.assertIsNone(self._patch(referral_source="google").account_type)

    def test_rejects_a_bad_value_with_400(self):
        with self.assertRaises(HTTPException) as ctx:
            self._patch(account_type="teacher")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_organization_is_trimmed_capped_and_cleared_by_empty(self):
        self.assertEqual(
            self._patch(organization="  Juilliard  ").organization, "Juilliard"
        )
        self.assertEqual(len(self._patch(organization="x" * 400).organization), 280)
        self.assertIsNone(self._patch(organization="   ").organization)


class AccountTypeFilterTests(unittest.TestCase):
    """The /admin/users list filter."""

    def _sql(self, value):
        return str(
            account_type_filter(User.account_type, value).compile(
                compile_kwargs={"literal_binds": True}
            )
        )

    def test_unknown_means_is_null_not_the_string_unknown(self):
        # The trap: `== "unknown"` compiles fine and matches zero rows forever,
        # so the filter looks like "I have no legacy users" instead of erroring.
        sql = self._sql("unknown")
        self.assertIn("IS NULL", sql)
        self.assertNotIn("unknown", sql)

    def test_a_real_type_compares_by_equality(self):
        sql = self._sql("educator")
        self.assertIn("= 'educator'", sql)

    def test_every_filter_token_is_accepted(self):
        for value in ACCOUNT_TYPE_FILTERS:
            self.assertIsNotNone(account_type_filter(User.account_type, value))

    def test_filter_tokens_are_the_three_types_plus_unknown(self):
        self.assertEqual(set(ACCOUNT_TYPE_FILTERS), {"actor", "educator", "student", "unknown"})


class AdminAccountTypeValidationTests(unittest.TestCase):
    """The admin path: PATCH /api/admin/users/{id}/profile."""

    def test_accepts_each_good_value(self):
        for value in ("actor", "educator", "student"):
            req = AdminProfilePatchRequest(account_type=value, note="Tagging an educator")
            self.assertEqual(req.account_type, value)

    def test_accepts_null(self):
        req = AdminProfilePatchRequest(note="No account_type change")
        self.assertIsNone(req.account_type)

    def test_rejects_a_bad_value(self):
        with self.assertRaises(ValidationError):
            AdminProfilePatchRequest(account_type="teacher", note="Bad value")

    def test_empty_string_is_sent_as_null_to_clear_a_mis_tag(self):
        # The endpoint keys off model_fields_set, not `is not None`, so "" has to
        # arrive as an explicitly-set None or untagging silently does nothing.
        req = AdminProfilePatchRequest(account_type="", note="Wrong tag, clearing")
        self.assertIsNone(req.account_type)
        self.assertIn("account_type", req.model_fields_set)

    def test_omitting_the_field_leaves_it_unset(self):
        req = AdminProfilePatchRequest(name="New Name", note="Unrelated edit")
        self.assertNotIn("account_type", req.model_fields_set)


if __name__ == "__main__":
    unittest.main()
