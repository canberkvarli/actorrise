"""A series script: episodes over scenes that restart at ONE."""

from app.services.scene_map import detect_scene_spans
from app.services.script_structure import _match_act, _match_scene


def _scene(n: str) -> str:
    return (
        f"SCENE {n}\n\nThe office.\n\n"
        "ESTHER: You came back.\n\nFRANK: I said I would.\n\n"
        "ESTHER: People say a lot of things.\n\nFRANK: Not me.\n\n"
    )


SERIES = (
    "ALMOST A THERAPIST\n\nA SCREENPLAY for TELEVISION\n\nALL RIGHTS RESERVED\n\n"
    "Copyright 2026\n\n"
    "EPISODE ONE\n\nBOUNDARIES\n\n" + _scene("ONE") + _scene("TWO") + _scene("ELEVEN")
    + "EPISODE TWO\n\n" + _scene("ONE") + _scene("TWO")
)


def test_episodes_are_the_top_level():
    spans = detect_scene_spans(SERIES)
    assert [(s.act_label, s.scene_label) for s in spans] == [
        ("Episode 1: Boundaries", "Scene 1"),
        ("Episode 1: Boundaries", "Scene 2"),
        ("Episode 1: Boundaries", "Scene 11"),
        ("Episode 2", "Scene 1"),
        ("Episode 2", "Scene 2"),
    ]


def test_heading_and_title_are_not_cast():
    first = detect_scene_spans(SERIES)[0]
    assert sorted(first.characters) == ["ESTHER", "FRANK"]


def test_episode_heading_forms():
    assert _match_act("EPISODE ONE") == "Episode 1"
    assert _match_act("Episode 12.") == "Episode 12"
    assert _match_act("EPISODE IV: The Return") == "Episode 4"
    assert _match_act("Episode one of many things that happened") is None


def test_scene_words_past_nine():
    assert _match_scene("SCENE TEN") == "Scene 10"
    assert _match_scene("SCENE SEVENTEEN") == "Scene 17"
    assert _match_scene("SCENE SEVEN") == "Scene 7"


def test_a_picked_text_upload_builds_only_the_picked_scenes():
    # One ticked scene of a Word file built all 36: text has no pages to cut by.
    from app.services.scene_map import text_for_selection

    spans = detect_scene_spans(SERIES)
    picked = [
        {"char_start": s.char_start, "char_end": s.char_end, "act_label": s.act_label}
        for s in (spans[1], spans[4])
    ]
    rebuilt = detect_scene_spans(text_for_selection(SERIES, picked))
    assert [(s.act_label, s.scene_label) for s in rebuilt] == [
        ("Episode 1: Boundaries", "Scene 2"),
        ("Episode 2", "Scene 2"),
    ]


def test_a_selection_with_no_spans_reads_everything():
    from app.services.scene_map import text_for_selection

    assert text_for_selection(SERIES, [{"page_start": 1, "page_end": 2}]) is None
