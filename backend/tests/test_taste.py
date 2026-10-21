"""Three days of Plus, no card, the first time a free web reader hits the wall.

Spec: docs/superpowers/specs/2026-10-21-three-day-taste-design.md. The rules
that matter: once per person ever, never on top of a payer or an app
subscription, it ends by itself, and once had there is no second free stretch.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.organization import Organization
from app.models.billing import BillingHistory, PricingTier, UserSubscription
from app.models.user import User
from app.models.user_event import UserEvent
from app.services import taste
from tests.dbfixture import memory_db, restore


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


def _user(db, uid=10, account_type="actor"):
    u = User(id=uid, email=f"a{uid}@example.com", account_type=account_type)
    db.add(u)
    db.commit()
    return u


def _sub(db, uid, **kw):
    s = UserSubscription(user_id=uid, tier_id=kw.pop("tier_id", 2), **kw)
    db.add(s)
    db.commit()
    return s


class TestGrant:
    def test_free_reader_gets_three_days_of_plus(self, db):
        u = _user(db)
        ends = taste.grant(db, u, "ios")
        assert ends is not None
        sub = db.query(UserSubscription).filter_by(user_id=u.id).one()
        assert sub.source == "taste" and sub.tier_id == 2 and sub.is_active
        assert sub.stripe_subscription_id is None
        hours = (ends - datetime.now(timezone.utc)).total_seconds() / 3600
        assert 71.9 < hours <= 72
        ev = db.query(UserEvent).filter_by(user_id=u.id, event_name="taste_started").one()
        assert ev.properties["client_platform"] == "ios"

    def test_once_ever(self, db):
        u = _user(db)
        assert taste.grant(db, u) is not None
        sub = db.query(UserSubscription).filter_by(user_id=u.id).one()
        sub.trial_end = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
        assert not sub.is_active
        assert taste.grant(db, u) is None

    def test_once_ever_even_after_a_stripe_row_replaced_it(self, db):
        """The event is the record, not the subscription row."""
        u = _user(db)
        taste.grant(db, u)
        sub = db.query(UserSubscription).filter_by(user_id=u.id).one()
        sub.source = None
        sub.status = "canceled"
        db.commit()
        assert taste.grant(db, u) is None

    def test_expired_free_row_is_reused(self, db):
        u = _user(db)
        _sub(db, u.id, tier_id=1, status="active")
        assert taste.grant(db, u) is not None
        assert db.query(UserSubscription).filter_by(user_id=u.id).count() == 1


class TestNeverTouchesPayers:
    @pytest.mark.parametrize("kw", [
        {"status": "active", "stripe_subscription_id": "sub_1", "source": "stripe"},
        {"status": "canceled", "stripe_subscription_id": "sub_2", "source": "stripe"},
        {"status": "canceled", "source": "stripe"},
        {"status": "active", "source": "revenuecat"},
        {"status": "canceled", "source": "revenuecat"},
        {"status": "trialing", "source": "manual",
         "trial_end": datetime.now(timezone.utc) + timedelta(days=10)},
    ])
    def test_refused_and_row_unchanged(self, db, kw):
        u = _user(db)
        sub = _sub(db, u.id, **kw)
        before = (sub.status, sub.source, sub.stripe_subscription_id, sub.trial_end)
        assert taste.grant(db, u) is None
        db.refresh(sub)
        assert (sub.status, sub.source, sub.stripe_subscription_id, sub.trial_end) == before
        assert db.query(UserEvent).count() == 0

    def test_anyone_who_ever_paid(self, db):
        u = _user(db)
        db.add(BillingHistory(user_id=u.id, amount_cents=1200, currency="usd", status="succeeded"))
        db.commit()
        assert taste.grant(db, u) is None

    @pytest.mark.parametrize("kind", ["educator", "student"])
    def test_teachers_and_students_have_their_own_month(self, db, kind):
        assert taste.grant(db, _user(db, account_type=kind)) is None


class TestStatus:
    def test_never_had(self, db):
        u = _user(db)
        assert taste.status(db, u.id) == {"had": False, "active": False, "ends_at": None}

    def test_running_then_over(self, db):
        u = _user(db)
        taste.grant(db, u)
        s = taste.status(db, u.id)
        assert s["had"] and s["active"] and s["ends_at"]
        sub = db.query(UserSubscription).filter_by(user_id=u.id).one()
        sub.trial_end = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
        assert taste.status(db, u.id) == {"had": True, "active": False, "ends_at": None}

    def test_tasted_ids(self, db):
        a, b = _user(db, 1), _user(db, 2)
        taste.grant(db, a)
        assert taste.tasted_user_ids(db) == {1}
