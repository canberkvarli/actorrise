from app.services.search.originality import originality_cap


def test_free_tier_ignores_the_cap():
    assert originality_cap(0.3, False, is_paid=False) is None
    assert originality_cap(None, True, is_paid=False) is None


def test_paid_tier_keeps_the_explicit_cap():
    assert originality_cap(0.3, False, is_paid=True) == 0.3
    assert originality_cap(0.7, True, is_paid=True) == 0.7


def test_paid_tier_exclude_overdone_means_fresh():
    assert originality_cap(None, True, is_paid=True) == 0.3


def test_nothing_asked_is_nothing():
    assert originality_cap(None, False, is_paid=True) is None
