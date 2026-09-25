"""Matching a Stripe subscription to the account it belongs to.

`customer.subscription.created` arrives for every subscription, including ones
made by hand in the Stripe dashboard. The webhook's elif chain had no branch for
it, so it fell through and returned 200 and Stripe counted it delivered. Comping
someone from the dashboard writes no row in this product, and nothing anywhere
says so.

Chloe Chan (29 May) and Louis Cunningham (6 June) were both active in Stripe and
absent from user_subscriptions for four months. Chloe read as FREE the whole
time.

The rule is kept here, away from the handler, so it can be tested without a
database or a Stripe fixture.
"""

from typing import Dict, Optional


def resolve_subscription_owner(
    *,
    customer_id: Optional[str],
    customer_email: Optional[str],
    by_customer_id: Dict[str, int],
    by_email: Dict[str, int],
) -> Optional[int]:
    """The user id this subscription belongs to, or None.

    The customer id wins when we have seen it before: it is the stronger claim,
    because an email can be changed or reused while the id cannot.

    Returning None is a real answer. Writing a subscription onto the wrong
    account gives a stranger someone else's membership, which is worse than
    leaving a row unwritten and fixing it by hand.
    """
    if customer_id:
        owner = by_customer_id.get(customer_id)
        if owner is not None:
            return owner

    email = (customer_email or "").strip().lower()
    if email:
        return by_email.get(email)
    return None
