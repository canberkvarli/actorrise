"""Gate messages follow the request's UI language (Turkish web, 2026-11-25)."""
import asyncio

import pytest
from fastapi import HTTPException

from app.middleware.rate_limiting import FeatureGate, _tr_name
from app.services.library_language import (
    DEFAULT_LANGUAGES,
    TURKISH_LANGUAGES,
    reset_request_languages,
    set_request_languages,
)
from app.services.ui_language import is_turkish, say


@pytest.fixture
def turkish():
    token = set_request_languages(TURKISH_LANGUAGES)
    yield
    reset_request_languages(token)


def test_english_outside_a_request():
    assert not is_turkish()
    assert say("hello", "merhaba") == "hello"


def test_turkish_request(turkish):
    assert is_turkish()
    assert say("hello", "merhaba") == "merhaba"


def test_english_request():
    token = set_request_languages(DEFAULT_LANGUAGES)
    try:
        assert say("hello", "merhaba") == "hello"
    finally:
        reset_request_languages(token)


def test_every_named_feature_has_turkish():
    for name in ("AI searches", "ScenePartner sessions", "Monologue work sessions", "CraftCoach sessions"):
        assert _tr_name(name)[0] != "kullanım"


def _limit_message(lifetime: bool) -> str:
    gate = FeatureGate("ai_search")
    gate._get_lifetime_usage = lambda *a, **k: 5
    gate._get_monthly_usage = lambda *a, **k: 5
    with pytest.raises(HTTPException) as e:
        asyncio.run(gate._check_usage_limit(1, "ai_searches_count", 5, None, "AI searches", lifetime=lifetime))
    return e.value.detail["message"]


def test_limit_message_in_turkish(turkish):
    assert _limit_message(False) == "Bu ayki 5 yapay zekâ araması sınırına ulaştın. Daha fazlası için planını yükselt."


def test_limit_message_in_english():
    assert _limit_message(True).startswith("You've reached your limit of 5 AI searches total.")
