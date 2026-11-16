"""Opening a taken-down piece is not a read.

The holder asked for the text to come off, so the detail endpoint serves none.
Before this, an open still wrote a view row, which spent a free read, could
start the one three-day taste of Plus, and for a spent free user came back
`paywalled`: the wall then sold Plus for a piece Plus cannot open. Actors with
the piece saved (24 saves, 2026-11-16) got exactly that.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.api import monologues as mono_api
from app.services.search.semantic_search import TAKEN_DOWN


def _row(review_status=TAKEN_DOWN):
    play = SimpleNamespace(
        id=7, title="A Play", author="A Writer", category="contemporary",
        copyright_status="copyrighted", license_type="fair_use",
        source_url="https://publisher.example/a-play", source_type="play",
        film_tv_reference=None, translator=None, language="en",
    )
    return SimpleNamespace(
        id=11, title="A speech", character_name="Sam", text="Every word of it. " * 20,
        text_segments=None, stage_directions=None, play=play, word_count=80,
        estimated_duration_seconds=40, view_count=3, favorite_count=1,
        character_gender=None, character_age_range=None, primary_emotion=None,
        emotion_scores=None, themes=[], tone=None, difficulty_level=None,
        overdone_score=0.0, scene_description=None, act=None, scene=None,
        review_status=review_status,
    )


def _db(row, saved=None):
    db = MagicMock()
    db.query.return_value.options.return_value.filter.return_value.first.return_value = row
    db.query.return_value.filter.return_value.first.return_value = saved
    return db


def _open(db):
    req = SimpleNamespace(headers={})
    user = SimpleNamespace(id=1, email="actor@example.com")
    return asyncio.run(mono_api.get_monologue(11, req, slid=None, rank=None, db=db, current_user=user))


def test_the_response_says_taken_down_and_carries_no_text():
    resp = _open(_db(_row()))
    assert resp.taken_down is True
    assert resp.text == ""
    assert resp.text_segments is None
    assert resp.source_url == "https://publisher.example/a-play"


def test_it_writes_no_view_and_spends_nothing():
    db = _db(_row())
    resp = _open(db)
    db.add.assert_not_called()
    db.commit.assert_not_called()
    assert resp.paywalled is False
    assert resp.taste is None


def test_a_saved_piece_still_reads_as_saved():
    saved = SimpleNamespace(created_at=None)
    assert _open(_db(_row(), saved=saved)).is_favorited is True


def test_the_tonight_quote_is_empty_for_a_takedown():
    assert mono_api._quote_of(_row()) == ""
    assert mono_api._quote_of(_row(review_status=None)) != ""


def test_a_visible_piece_is_not_marked():
    assert mono_api._monologue_to_response(_row(review_status=None)).taken_down is False
