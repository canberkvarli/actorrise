"""The three-place check the loop runs before a note says a title is in or out."""
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import library_check as lc  # noqa: E402
from app.api import loop_bridge  # noqa: E402
from app.api.loop_bridge import Job  # noqa: E402


def test_a_full_name_is_tried_word_by_word():
    # "Bella Baxter" is filed as "Bella" in Poor Things.
    assert lc.fallback_words("Bella Baxter") == ["Baxter", "Bella"]
    assert lc.fallback_words("the Joker monologue") == []  # one real word: nothing to fall back to
    assert lc.fallback_words("Hamlet") == []


def test_hits_are_grouped_by_play_biggest_first():
    play = lambda t: NS(title=t, author="A", source_type="film")  # noqa: E731
    rows = [NS(id=1, character_name="Bella", play=play("Her own way")),
            NS(id=2, character_name="Bella", play=play("Her own way")),
            NS(id=3, character_name="Bella", play=play("Poor Things"))]
    out = lc.report("character name", rows)
    assert out[0] == "character name: 3 pieces in 2 titles"
    assert out[1].startswith("  Her own way (A, film): 2, Bella; #1, #2")
    assert out[2].startswith("  Poor Things (A, film): 1")


def test_the_bridge_runs_it():
    cmd = loop_bridge.validate(Job(script="library_check", args=["--emotion", "jealousy"]))
    assert cmd[1].endswith("scripts/library_check.py") and cmd[2:] == ["--emotion", "jealousy"]
