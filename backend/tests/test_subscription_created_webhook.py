"""A subscription made outside checkout must still reach the app.

Stripe has been sending customer.subscription.created to this endpoint all
along -- it is in the endpoint's enabled_events -- and the handler's elif chain
had no branch for it, so it fell through and returned 200. Stripe counted every
one as delivered. Silent by construction.

What that cost: comping someone by creating a subscription in the Stripe
dashboard produces no checkout.session, so no row was ever written. Chloe Chan
(29 May) and Louis Cunningham (6 June) are both active in Stripe and were
missing from user_subscriptions for four months. Chloe read as FREE in the
product the entire time.

The match is on customer id first, then the customer's email, mirroring the
payment-link fallback already in handle_checkout_completed. No user, no row --
never a guess, because writing a subscription onto the wrong account is worse
than not writing one at all.
"""

import pytest

from app.services.stripe_sync import resolve_subscription_owner


def test_a_known_customer_id_wins():
    owner = resolve_subscription_owner(
        customer_id="cus_ABC", customer_email=None,
        by_customer_id={"cus_ABC": 42}, by_email={},
    )
    assert owner == 42


def test_email_is_the_fallback_when_the_customer_is_new():
    owner = resolve_subscription_owner(
        customer_id="cus_NEW", customer_email="chloe@example.com",
        by_customer_id={}, by_email={"chloe@example.com": 136},
    )
    assert owner == 136


def test_email_matching_ignores_case():
    owner = resolve_subscription_owner(
        customer_id="cus_NEW", customer_email="Chloe@Example.COM",
        by_customer_id={}, by_email={"chloe@example.com": 136},
    )
    assert owner == 136


def test_the_customer_id_beats_a_conflicting_email():
    """The id is the stronger claim: an email can be reused or changed."""
    owner = resolve_subscription_owner(
        customer_id="cus_ABC", customer_email="someone.else@example.com",
        by_customer_id={"cus_ABC": 42}, by_email={"someone.else@example.com": 99},
    )
    assert owner == 42


def test_no_match_returns_nothing_rather_than_guessing():
    """Writing a subscription onto the wrong account is worse than no row."""
    owner = resolve_subscription_owner(
        customer_id="cus_NOBODY", customer_email="nobody@example.com",
        by_customer_id={}, by_email={},
    )
    assert owner is None


def test_a_missing_email_is_not_treated_as_a_match():
    owner = resolve_subscription_owner(
        customer_id="cus_NEW", customer_email=None,
        by_customer_id={}, by_email={"": 7},
    )
    assert owner is None
