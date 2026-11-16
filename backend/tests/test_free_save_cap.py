"""A free account holds FREE_SAVES_LIMIT monologues saved at once (2026-11-16).

Saves were uncapped until then: bookmarks_limit sat in the free tier row and no
route read it. Onboarding keeps 3 picks, so the cap of 5 leaves 2 saves by hand
before the offer. Pieces saved before the cap stay; only a new save is refused.
"""

from types import SimpleNamespace

import pytest

import app.api.monologues as mono_api


class _Query:
    def __init__(self, held):
        self.held = held

    def filter(self, *_a, **_k):
        return self

    def count(self):
        return self.held


class _Db:
    def __init__(self, held):
        self.held = held

    def query(self, *_a, **_k):
        return _Query(self.held)


USER = SimpleNamespace(id=42, email="actor@example.com")


@pytest.fixture
def free(monkeypatch):
    monkeypatch.setattr(mono_api, "_user_has_unlimited_reads", lambda *a, **k: False)


def test_the_cap_is_five():
    assert mono_api.FREE_SAVES_LIMIT == 5


def test_under_the_cap_saves(free):
    assert mono_api._free_save_refused(_Db(4), USER) is None


def test_at_the_cap_is_refused_with_the_offer(free):
    assert mono_api._free_save_refused(_Db(5), USER) == {
        "error": "saves_plus", "used": 5, "limit": 5,
    }


def test_someone_already_past_the_cap_keeps_theirs_but_adds_none(free):
    """Six onboarding picks from before the change: nothing is taken away."""
    assert mono_api._free_save_refused(_Db(6), USER)["used"] == 6


def test_plus_is_never_capped(monkeypatch):
    monkeypatch.setattr(mono_api, "_user_has_unlimited_reads", lambda *a, **k: True)
    assert mono_api._free_save_refused(_Db(500), USER) is None


def _request(headers):
    return SimpleNamespace(headers=headers)


def test_the_web_is_capped(free):
    assert mono_api._free_save_refused(_Db(5), USER, _request({})) is not None


def test_an_old_app_build_is_not_capped(free):
    """Builds before the cap have no paywall for a refused save."""
    req = _request({"x-client": "ghostlight"})
    assert mono_api._free_save_refused(_Db(50), USER, req) is None


def test_a_new_app_build_is_capped(free):
    req = _request({"x-client": "ghostlight", "x-app-version": "1.1.4"})
    assert mono_api._free_save_refused(_Db(5), USER, req)["error"] == "saves_plus"
