"""scripts/opt_out.py: off the list and off the account, safe to repeat."""

import unittest

from app.models.email_do_not_contact import EmailDoNotContact
from app.models.organization import Organization
from app.models.user import User
from scripts.opt_out import opt_out
from tests.dbfixture import memory_db, restore

REASON = 'OPT-OUT: replied "unsubscribe" to the day-10 email on 2026-10-02'


class OptOutTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, EmailDoNotContact])
        self.user = User(
            email="Maya@Example.com", supabase_id="s1", marketing_opt_in=True, name="Maya Lopez"
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_it_does_both(self):
        did = opt_out(self.db, " maya@example.COM ", REASON)
        self.assertEqual(did, {"listed": True, "account": "opted_out"})
        row = self.db.query(EmailDoNotContact).one()
        self.assertEqual((row.email, row.reason, row.name), ("maya@example.com", REASON, "Maya Lopez"))
        self.db.refresh(self.user)
        self.assertFalse(self.user.marketing_opt_in)

    def test_twice_is_once(self):
        opt_out(self.db, "maya@example.com", REASON)
        did = opt_out(self.db, "MAYA@example.com", "a second reason")
        self.assertEqual(did, {"listed": False, "account": "already_out"})
        row = self.db.query(EmailDoNotContact).one()
        self.assertEqual(row.reason, REASON)  # the first reason stands

    def test_someone_with_no_account_is_still_listed(self):
        did = opt_out(self.db, "stranger@example.com", REASON)
        self.assertEqual(did, {"listed": True, "account": "none"})

    def test_a_bounce_leaves_the_account_alone(self):
        did = opt_out(self.db, "maya@example.com", "BOUNCE: 550 5.1.1, 2026-10-02", bounce=True)
        self.assertEqual(did, {"listed": True, "account": "left_alone"})
        self.db.refresh(self.user)
        self.assertTrue(self.user.marketing_opt_in)

    def test_it_wants_an_address_and_a_reason(self):
        with self.assertRaises(ValueError):
            opt_out(self.db, "not an address", REASON)
        with self.assertRaises(ValueError):
            opt_out(self.db, "maya@example.com", "   ")
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 0)


if __name__ == "__main__":
    unittest.main()


class TheLinks(unittest.TestCase):
    """GET /unsubscribe and /resubscribe, called as functions with a real token."""

    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, EmailDoNotContact])
        self.user = User(email="maya@example.com", supabase_id="s1", marketing_opt_in=True, name="Maya")
        self.db.add(self.user)
        self.db.commit()
        from app.services.email.marketing import generate_unsubscribe_token

        self.token = generate_unsubscribe_token("maya@example.com")

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _unsubscribe(self):
        from app.api.auth import unsubscribe

        return unsubscribe(email="maya@example.com", token=self.token, request=None, db=self.db)

    def _resubscribe(self):
        from app.api.auth import resubscribe

        return resubscribe(email="maya@example.com", token=self.token, request=None, db=self.db)

    def test_the_link_lands_on_both_lists(self):
        self._unsubscribe()
        row = self.db.query(EmailDoNotContact).one()
        self.assertEqual(row.email, "maya@example.com")
        self.assertTrue(row.reason.startswith("OPT-OUT: clicked the unsubscribe link on 20"))
        self.db.refresh(self.user)
        self.assertFalse(self.user.marketing_opt_in)

    def test_the_link_twice_is_once(self):
        self._unsubscribe()
        self._unsubscribe()
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 1)

    def test_a_bad_token_touches_nothing(self):
        from app.api.auth import unsubscribe

        unsubscribe(email="maya@example.com", token="nope", request=None, db=self.db)
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 0)
        self.db.refresh(self.user)
        self.assertTrue(self.user.marketing_opt_in)

    def test_resubscribe_undoes_the_link(self):
        self._unsubscribe()
        self._resubscribe()
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 0)
        self.db.refresh(self.user)
        self.assertTrue(self.user.marketing_opt_in)

    def test_resubscribe_undoes_a_filed_reply_too(self):
        opt_out(self.db, "maya@example.com", REASON)
        self._resubscribe()
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 0)
        self.db.refresh(self.user)
        self.assertTrue(self.user.marketing_opt_in)

    def test_resubscribe_leaves_a_bounce_alone(self):
        opt_out(self.db, "maya@example.com", "BOUNCE: 550 5.1.1 address not found, 2026-10-02", bounce=True)
        self._resubscribe()
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 1)

    def test_resubscribe_leaves_a_payer_alone(self):
        self.db.add(EmailDoNotContact(email="maya@example.com", reason="Paid subscriber"))
        self.db.commit()
        self._resubscribe()
        self.assertEqual(self.db.query(EmailDoNotContact).count(), 1)
