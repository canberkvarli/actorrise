"""Giving up the actor's filters, in the order that costs them least.

An empty page is the worst answer available: the actor learns nothing and
leaves. When the page comes back empty these are surrendered one at a time,
cheapest first, and the page says which kinds were relaxed.

The tab is last and it is deliberate. "contemporary dramatic piece with sadness"
returned nothing on the Plays tab and 20 pieces with no filter at all, because
what matches sadness in this library is film and TV. Cross-tab recovery already
existed for TITLES -- its comment says the tab is how the library is filed, not
what the actor wanted -- and this is the same idea for attribute queries, which
it never covered.
"""

from app.services.search.empty_page_retry import (EMPTY_PAGE_RETRY_ORDER,
                                                  retry_keys)


def test_the_tab_is_surrendered_last():
    assert EMPTY_PAGE_RETRY_ORDER[-1] == "source_type"


def test_intent_goes_before_the_tab():
    assert EMPTY_PAGE_RETRY_ORDER == ("emotion", "tone", "category", "source_type")


def test_gender_is_never_surrendered():
    """Casting is not a preference. A female actor handed a male speech has been
    given a worse answer than none."""
    assert "gender" not in EMPTY_PAGE_RETRY_ORDER


def test_only_keys_that_are_set_come_back():
    assert retry_keys({"source_type": "play", "gender": "female"}) == ["source_type"]


def test_keys_come_back_in_priority_order():
    keys = retry_keys(
        {"source_type": "play", "category": "contemporary",
         "emotion": "sadness", "tone": "dramatic", "gender": "female"}
    )
    assert keys == ["emotion", "tone", "category", "source_type"]


def test_nothing_to_give_up_when_only_gender_is_set():
    assert retry_keys({"gender": "female"}) == []


def test_an_empty_filter_set_yields_nothing():
    assert retry_keys({}) == []
