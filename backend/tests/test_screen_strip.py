"""A Plays-tab search the plays cannot serve also shows film and TV (screen_strip.py)."""

from app.services.search.screen_strip import screen_filters, should_offer_screen


def _offer(filters, weak=False, page=1, q="confessing my love", prepass=False):
    return should_offer_screen(q=q, filters=filters, page=page, weak_match=weak, title_prepass=prepass)


def test_contemporary_or_teen_plays_search_gets_the_strip():
    assert _offer({"source_type": "play", "category": "contemporary"})
    assert _offer({"source_type": "play", "age_range": "teens"})


def test_a_weak_plays_search_gets_it_whatever_the_filters():
    assert _offer({"source_type": "play"}, weak=True)


def test_a_strong_plain_plays_search_is_left_alone():
    assert not _offer({"source_type": "play"})


def test_never_on_classical_film_tab_later_pages_empty_query_or_a_named_show():
    assert not _offer({"source_type": "play", "category": "classical"}, weak=True)
    assert not _offer({"source_type": ["film", "tv"]}, weak=True)
    assert not _offer({"source_type": "play", "age_range": "teens"}, page=2)
    assert not _offer({"source_type": "play", "age_range": "teens"}, q="  ")
    assert not _offer({"source_type": "play", "age_range": "teens"}, prepass=True)


def test_screen_filters_keep_the_ask_and_drop_the_era():
    out = screen_filters({"source_type": "play", "category": "contemporary", "gender": "male", "age_range": "teens"})
    assert out == {"source_type": ["film", "tv"], "gender": "male", "age_range": "teens"}
