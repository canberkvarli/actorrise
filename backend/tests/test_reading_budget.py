"""The monthly scene-reading net: past the budget, scenes keep the rule lines, flagged."""
from app.services.reading_budget import LIMIT_PROBLEM
from app.services.scene_reader import read_scenes


def _scene(name):
    lines = [{"character": "A", "text": f"{name} one."}, {"character": "B", "text": f"{name} two."}]
    return {"_source_text": f"A: {name} one.\n\nB: {name} two.", "lines": lines}


def test_no_budget_means_no_limit():
    scenes = read_scenes([_scene("x")], client=None, budget=None)
    assert LIMIT_PROBLEM not in scenes[0]["reading"]["problems"]


def test_scenes_past_the_budget_are_kept_as_parsed_and_say_why():
    scenes = read_scenes([_scene("x"), _scene("y"), _scene("z")], client=None, budget=1)
    problems = [s["reading"]["problems"] for s in scenes]
    assert LIMIT_PROBLEM not in problems[0]
    assert problems[1] == [LIMIT_PROBLEM] and problems[2] == [LIMIT_PROBLEM]
    assert all(s["reading"]["flagged"] for s in scenes[1:])
    assert scenes[1]["lines"][0]["text"] == "y one."


def test_a_spent_budget_reads_nothing():
    scenes = read_scenes([_scene("x")], client=None, budget=0)
    assert scenes[0]["reading"]["problems"] == [LIMIT_PROBLEM]
