"""The actor's own map of a script: order, and which act each scene sits under."""

from types import SimpleNamespace

import pytest

from app.services.script_additions import built_keys
from app.services.script_layout import LayoutError, apply_layout, clean_act


def _scene(id, act, number):
    return SimpleNamespace(id=id, act=act, scene_number=number, original_snapshot=None, script_order=None)


def test_puts_scenes_in_the_order_asked_under_the_act_named():
    a, b, c = _scene(1, "Episode 1", "Scene 1"), _scene(2, "Episode 1", "Scene 2"), _scene(3, "Episode 2", "Scene 1")
    out = apply_layout([a, b, c], [{"id": 3, "act": "Episode 2"}, {"id": 1, "act": "Episode 1"}, {"id": 2, "act": "Episode 2"}])
    assert [s.id for s in out] == [3, 1, 2]
    assert [s.script_order for s in (c, a, b)] == [0, 1, 2]
    assert b.act == "Episode 2"


def test_refused_unless_every_scene_is_named_once():
    scenes = [_scene(1, None, None), _scene(2, None, None)]
    with pytest.raises(LayoutError):
        apply_layout(scenes, [{"id": 1}])
    with pytest.raises(LayoutError):
        apply_layout(scenes, [{"id": 1}, {"id": 1}])
    with pytest.raises(LayoutError):
        apply_layout(scenes, [{"id": 1}, {"id": 9}])


def test_a_refiled_scene_is_still_known_by_the_heading_it_was_read_under():
    s = _scene(1, "Episode 1", "Scene 3")
    apply_layout([s], [{"id": 1, "act": "Episode 2"}])
    assert s.original_snapshot["read_heading"] == {"act": "Episode 1", "scene_number": "Scene 3"}
    keys = built_keys([s])
    assert ("episode 1", "scene 3") in keys and ("episode 2", "scene 3") in keys
    # Moved again: the first heading is the one kept.
    apply_layout([s], [{"id": 1, "act": "Episode 4"}])
    assert s.original_snapshot["read_heading"]["act"] == "Episode 1"


def test_other_snapshot_keys_stay():
    s = _scene(1, "Act 1", "Scene 1")
    s.original_snapshot = {"reading": {"x": 1}}
    apply_layout([s], [{"id": 1, "act": "Act 2"}])
    assert s.original_snapshot["reading"] == {"x": 1}


def test_an_unchanged_act_leaves_the_snapshot_alone():
    s = _scene(1, "Act 1", "Scene 1")
    apply_layout([s], [{"id": 1, "act": "  Act   1 "}])
    assert s.original_snapshot is None and s.act == "Act 1"


def test_clean_act():
    assert clean_act("  Episode  2:  Fallout ") == "Episode 2: Fallout"
    assert clean_act("   ") is None
    assert clean_act(None) is None
