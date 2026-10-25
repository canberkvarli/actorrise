"""Choosing more scenes from a script already on the shelf."""

from types import SimpleNamespace

from app.services.scene_map import detect_scene_spans, text_for_selection
from app.services.script_additions import (
    apply_genres,
    built_indices,
    built_keys,
    clean_genres,
    is_new_scene,
    unbuilt_picks,
)
from app.api.scripts import ScannedScene
from tests.test_episode_structure import SERIES


def _scanned():
    return [
        ScannedScene(
            index=i, act_label=s.act_label, scene_label=s.scene_label, title=None,
            characters=s.characters, line_count=s.line_count,
            char_start=s.char_start, char_end=s.char_end, page_start=None, page_end=None,
        )
        for i, s in enumerate(detect_scene_spans(SERIES))
    ]


def _built(act, number):
    return SimpleNamespace(act=act, scene_number=number)


def test_a_built_scene_is_found_in_a_fresh_read():
    keys = built_keys([_built("Episode 2", "Scene 2")])
    rows = _scanned()
    assert [(rows[i].act_label, rows[i].scene_label) for i in built_indices(rows, keys)] == [
        ("Episode 2", "Scene 2"),
    ]


def test_matching_ignores_case_and_spacing():
    keys = built_keys([_built("episode 1:  boundaries", "SCENE 11")])
    assert len(built_indices(_scanned(), keys)) == 1


def test_scene_2_of_another_episode_is_not_built():
    """Scene numbers restart every episode; the episode is half the key."""
    keys = built_keys([_built("Episode 2", "Scene 2")])
    picks = [{"act_label": "Episode 1: Boundaries", "scene_label": "Scene 2"}]
    assert unbuilt_picks(picks, keys) == picks


def test_a_tick_on_a_built_scene_is_dropped():
    keys = built_keys([_built("Episode 2", "Scene 2")])
    assert unbuilt_picks([{"act_label": "Episode 2", "scene_label": "Scene 2"}], keys) == []


def test_an_unlabelled_scene_is_never_counted_as_built():
    keys = built_keys([_built(None, None)])
    assert keys == set()
    assert is_new_scene({"act": None, "scene_number": None}, keys)


def test_only_the_new_ticks_are_built():
    rows = _scanned()
    keys = built_keys([_built("Episode 1: Boundaries", "Scene 2")])
    picks = [r.model_dump() for r in rows if r.scene_label == "Scene 2"]
    fresh = unbuilt_picks(picks, keys)
    rebuilt = detect_scene_spans(text_for_selection(SERIES, fresh))
    assert [(s.act_label, s.scene_label) for s in rebuilt] == [("Episode 2", "Scene 2")]


def test_genres_are_cleaned():
    assert clean_genres(["Comedy", "drama", "Comedy", "Romance", "Thriller"]) == ["Comedy", "drama", "Romance"]
    assert clean_genres("Comedy, Drama") == ["Comedy", "Drama"]
    assert clean_genres("Comedy-Drama") == ["Comedy-Drama"]
    assert clean_genres(None) == []
    assert clean_genres([None, 3, " "]) == []


def test_genre_follows_the_first_of_genres():
    script = SimpleNamespace(genre="Drama", genres=None)
    apply_genres(script, ["Comedy", "Drama"])
    assert (script.genre, script.genres) == ("Comedy", ["Comedy", "Drama"])
    apply_genres(script, [])
    assert script.genre == "Comedy"  # nothing learned changes nothing


def _scan(n=1):
    from app.api.scripts import ScriptScanResponse

    return ScriptScanResponse(
        page_count=n, has_structure=True, num_acts=1, num_sections=n,
        show_mode_choice=False, estimated_quick_seconds=8,
        estimated_full_seconds=10, scenes=_scanned(),
    )


def test_a_kept_map_is_read_back_without_scanning():
    from app.api.scripts import keep_scan, kept_scan

    script = SimpleNamespace(source_text=SERIES, scene_map=None)
    assert kept_scan(script) is None
    keep_scan(script, _scan())
    assert kept_scan(script) == _scan()


def test_a_changed_text_reads_the_map_again():
    from app.api.scripts import keep_scan, kept_scan

    script = SimpleNamespace(source_text=SERIES, scene_map=None)
    keep_scan(script, _scan())
    script.source_text = SERIES + "\nMORE.\n"
    assert kept_scan(script) is None


def test_a_newer_map_reader_reads_the_map_again(monkeypatch):
    from app.api.scripts import keep_scan, kept_scan
    from app.services import scene_map

    script = SimpleNamespace(source_text=SERIES, scene_map=None)
    keep_scan(script, _scan())
    monkeypatch.setattr(scene_map, "MAP_VERSION", scene_map.MAP_VERSION + 1)
    assert kept_scan(script) is None
