"""An empty shelf must not be answered with an empty screen.

`category=contemporary` + `source_type=play` is 14 plays. Add any second
constraint -- gender, tone, emotion, age -- and it is empty by construction, and
every one of the 8 zero-result-never-scored searches in the 30 days to
2026-09-20 carried exactly that pair:

    Shakespeare        {category: contemporary, source_type: play}
    sad monologues     {gender, emotion, category: contemporary, age_range, source_type: play}
    courtroom          {tone, gender, category: contemporary, source_type: play}

"Shakespeare" is the clearest: 1,608 Shakespeare pieces in the library, 0 of
them contemporary, so the filter made the answer impossible before the query ran.

Graceful relaxation already existed and could not help: RELAX_ORDER is
("age_range", "max_duration", "min_duration") and its comment says "never the
era". The one filter that empties the shelf was the one filter relaxation was
forbidden to touch.

This is the last resort, and it fires only at zero.
"""

from app.services.search.semantic_search import (LAST_RESORT_RELAX_ORDER,
                                                 RELAX_ORDER,
                                                 last_resort_keys, relax_step)


def test_the_normal_order_is_untouched():
    """Ordinary broadening must behave exactly as before."""
    assert RELAX_ORDER == ("age_range", "max_duration", "min_duration")


def test_era_is_droppable_only_as_a_last_resort():
    assert "category" not in RELAX_ORDER
    assert "category" in LAST_RESORT_RELAX_ORDER


def test_intent_is_given_up_in_order_of_least_meaning():
    """Emotion before tone before era: an actor who typed 'sad' can live with a
    piece the corpus tagged otherwise more easily than with the wrong era."""
    assert LAST_RESORT_RELAX_ORDER == ("emotion", "tone", "category")


def test_gender_is_never_dropped():
    """Casting is not a preference. A female actor sent a male speech has been
    given a worse answer than none."""
    assert "gender" not in RELAX_ORDER
    assert "gender" not in LAST_RESORT_RELAX_ORDER


def test_only_the_keys_actually_present_are_offered():
    keys = last_resort_keys({"category": "contemporary", "source_type": "play"})
    assert keys == ["category"]


def test_keys_come_back_in_priority_order():
    keys = last_resort_keys(
        {"tone": "dramatic", "category": "contemporary", "emotion": "sadness",
         "gender": "female", "source_type": "play"}
    )
    assert keys == ["emotion", "tone", "category"]


def test_nothing_to_relax_when_no_soft_filters_are_set():
    assert last_resort_keys({"source_type": "play", "gender": "female"}) == []


def test_relax_step_drops_the_era_outright():
    f = {"category": "contemporary", "source_type": "play"}
    relax_step(f, "category")
    assert "category" not in f
    assert f["source_type"] == "play", "the tab the actor is standing on must survive"
