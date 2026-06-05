"""
Shared filters for admin statistics.

Test / dev / internal accounts skew the dashboard and make it hard to read real
user numbers. These helpers centralise the "is this a real end-user?" rule so
every admin stat applies it consistently.

A test/dev account is any of:
  - email on the @actorrise.com domain (staff + internal test accounts)
  - email starting with "test" (test@…, testuser@…, etc.)
  - a specific known dev account
"""

from sqlalchemy import func, or_

from app.models.user import User

# Known personal/dev accounts that don't fit the patterns above.
EXTRA_TEST_EMAILS = {
    "canberkvarli@gmail.com",
}


def test_user_filter():
    """SQLAlchemy boolean expression — True for test/dev/internal accounts."""
    email = func.lower(User.email)
    return or_(
        email.like("%@actorrise.com"),
        email.like("test%"),
        email.in_({e.lower() for e in EXTRA_TEST_EMAILS}),
    )


def real_user_filter():
    """SQLAlchemy boolean expression — True for genuine end-user accounts."""
    return ~test_user_filter()


def real_user_ids_query(db):
    """A query of User.id for real (non-test) accounts.

    Usable as a subquery in `.notin_()` / `.in_()` filters on tables that
    reference users (UsageMetrics, UserSubscription, …).
    """
    return db.query(User.id).filter(real_user_filter())
