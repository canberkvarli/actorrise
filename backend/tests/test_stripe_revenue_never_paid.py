"""A comp whose renewal previews at full price is not earning yet."""
from app.api.admin import stripe_revenue as sr


class _List(list):
    def auto_paging_iter(self):
        return iter(self)


def _sub(id_, interval="year"):
    return {"id": id_, "current_period_end": 1800000000,
            "items": {"data": [{"price": {"recurring": {"interval": interval, "interval_count": 1},
                                          "unit_amount": 9900 if interval == "year" else 1200}}]}}


def test_never_paid_comp_is_deferred_not_earned(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    subs = {"active": _List([_sub("payer", "month"), _sub("comp")]), "trialing": _List([])}
    monkeypatch.setattr(sr.stripe.Subscription, "list", lambda status, limit: subs[status])
    monkeypatch.setattr(sr, "_real_monthly", lambda s: (1200.0, None) if s["id"] == "payer" else (825.0, None))
    paid = {"payer": [{"amount_paid": 1200}], "comp": [{"amount_paid": 0}]}
    monkeypatch.setattr(sr.stripe.Invoice, "list", lambda subscription, status, limit: _List(paid[subscription]))
    out = sr._compute()
    assert out["mrr_now_usd"] == 12.0
    assert out["paying_count"] == 1 and out["free_count"] == 1
    assert out["coupon_expiry_worth_usd"] == 8.25
