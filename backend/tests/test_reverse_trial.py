"""Seven days of Plus, no card, for even-id new web signups (2026-10-31).

The rules: only accounts made since launch, never an anonymous app account,
never a teacher or student, once per person (it is a taste), and both arms
get an arm event so the test has a denominator.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.billing import BillingHistory, PricingTier, UserSubscription
from app.models.organization import Organization
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import reverse_trial, taste
from tests.dbfixture import memory_db, restore

NOW = datetime.now(timezone.utc)


@pytest.fixture()
def db():
    session, saved = memory_db([Organization, User, PricingTier, UserSubscription, BillingHistory, UserEvent])
    session.add_all([
        PricingTier(id=1, name="free", display_name="Free", features={}, monthly_price_cents=0, annual_price_cents=0),
        PricingTier(id=2, name="plus", display_name="Plus", features={}, monthly_price_cents=1200, annual_price_cents=9900),
    ])
    session.commit()
    try:
        yield session
    finally:
        session.close()
        restore(saved)


def _user(db, uid, account_type="actor", created=None, email=None):
    u = User(
        id=uid,
        email=email or f"a{uid}@example.com",
        account_type=account_type,
        created_at=created or NOW,
    )
    db.add(u)
    db.commit()
    return u


def _events(db, uid, name):
    return db.query(UserEvent).filter_by(user_id=uid, event_name=name).all()


def test_even_ids_get_a_week_of_plus(db):
    u = _user(db, 20)
    ends = reverse_trial.on_onboarded(db, u, "web")
    assert ends is not None
    hours = (ends - datetime.now(timezone.utc)).total_seconds() / 3600
    assert 167.9 < hours <= 168
    sub = db.query(UserSubscription).filter_by(user_id=20).one()
    assert sub.source == "taste" and sub.is_active and sub.stripe_subscription_id is None
    assert _events(db, 20, "reverse_trial_arm")[0].properties["arm"] == "reverse"
    assert len(_events(db, 20, "reverse_trial_started")) == 1
    assert _events(db, 20, "taste_started")[0].properties["reason"] == "reverse"


def test_odd_ids_are_the_control_and_still_counted(db):
    u = _user(db, 21)
    assert reverse_trial.on_onboarded(db, u) is None
    assert db.query(UserSubscription).filter_by(user_id=21).first() is None
    assert _events(db, 21, "reverse_trial_arm")[0].properties["arm"] == "control"


def test_a_reverse_week_means_no_taste_at_the_wall_later(db):
    u = _user(db, 22)
    reverse_trial.on_onboarded(db, u)
    sub = db.query(UserSubscription).filter_by(user_id=22).one()
    sub.trial_end = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()
    assert taste.grant(db, u) is None


def test_accounts_from_before_launch_are_left_alone(db):
    u = _user(db, 24, created=reverse_trial.LAUNCH - timedelta(days=1))
    assert reverse_trial.on_onboarded(db, u) is None
    assert _events(db, 24, "reverse_trial_arm") == []


def test_anonymous_app_accounts_are_left_alone(db):
    u = _user(db, 26, email="anon+abc@anon.actorrise.com")
    assert reverse_trial.on_onboarded(db, u) is None
    assert _events(db, 26, "reverse_trial_arm") == []


@pytest.mark.parametrize("kind", ["educator", "student"])
def test_teachers_and_students_get_their_class_month_instead(db, kind):
    u = _user(db, 28, account_type=kind)
    assert reverse_trial.on_onboarded(db, u) is None
    ev = _events(db, 28, "reverse_trial_arm")[0]
    assert ev.properties == {"arm": "reverse", "eligible": False}


def test_someone_already_on_plus_is_not_touched(db):
    u = _user(db, 30)
    db.add(UserSubscription(user_id=30, tier_id=2, status="active", source="stripe",
                            stripe_subscription_id="sub_x"))
    db.commit()
    assert reverse_trial.on_onboarded(db, u) is None
    assert db.query(UserSubscription).filter_by(user_id=30).one().source == "stripe"
