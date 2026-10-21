"""The pricing cards show the read wall's own number, so they cannot drift."""

from app.api.pricing import _out
from app.middleware.rate_limiting import FREE_MONOLOGUE_READ_LIMIT
from app.models.billing import PricingTier


def _tier(name: str) -> PricingTier:
    return PricingTier(
        id=1, name=name, display_name=name.title(), description=None,
        monthly_price_cents=0, annual_price_cents=0,
        features={"monologue_sessions": 2}, is_active=True, sort_order=0,
    )


def test_free_card_carries_the_wall_number():
    out = _out(_tier("free"))
    assert out.features["monologue_reads_per_month"] == FREE_MONOLOGUE_READ_LIMIT
    assert out.features["monologue_sessions"] == 2


def test_paid_card_reads_unlimited():
    assert _out(_tier("plus")).features["monologue_reads_per_month"] == -1


def test_the_stored_features_are_not_touched():
    tier = _tier("free")
    _out(tier)
    assert "monologue_reads_per_month" not in tier.features
