"""Yesterday for a cloud session: the loop's snapshots, and the bridge's way to them."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import loop_snapshot as ls  # noqa: E402
from app.api import loop_bridge  # noqa: E402
from app.api.loop_bridge import Job  # noqa: E402


@pytest.mark.parametrize("args", [[], ["--store"]])
def test_the_brief_runs_bare_or_stored(args):
    assert loop_bridge.validate(Job(script="conversion_brief", args=args))[2:] == args


@pytest.mark.parametrize("args", [["--save"], ["--store", "--save"], ["--store", "x"]])
def test_the_brief_takes_nothing_else(args):
    with pytest.raises(HTTPException):
        loop_bridge.validate(Job(script="conversion_brief", args=args))


def test_keep_takes_only_the_best_move(monkeypatch, capsys):
    kept = []
    monkeypatch.setattr(ls, "store", lambda kind, body, day=None: kept.append((kind, body)))
    monkeypatch.setattr(sys, "argv", ["loop_snapshot.py", "keep", "best_move", "chase the drama teacher"])
    ls.main()
    assert kept == [("best_move", "chase the drama teacher")]
    monkeypatch.setattr(sys, "argv", ["loop_snapshot.py", "keep", "brief", "x"])
    with pytest.raises(SystemExit):
        ls.main()


def test_snapshots_take_show_keep_only():
    loop_bridge.validate(Job(script="loop_snapshot", args=["take"]))
    loop_bridge.validate(Job(script="loop_snapshot", args=["show", "--ago", "7"]))
    for bad in ([], ["delete"]):
        with pytest.raises(HTTPException):
            loop_bridge.validate(Job(script="loop_snapshot", args=bad))


def test_a_failed_source_is_stored_as_unavailable_not_zero(monkeypatch):
    stored = {}
    monkeypatch.setattr(ls, "store", lambda kind, body, day=None: stored.__setitem__(kind, body))

    def boom():
        raise RuntimeError("STRIPE_SECRET_KEY not set")

    monkeypatch.setattr(ls, "_money", boom)
    monkeypatch.setattr(ls, "_script", lambda *a: f"ran {' '.join(a)}\n")
    taken = ls.take()
    assert stored == taken
    assert taken["money"] == "unavailable: STRIPE_SECRET_KEY not set"
    assert taken["class_links"] == "ran class_link.py list\n"
    assert taken["revenuecat"] == "ran revenuecat_report.py\n"


def test_show_with_nothing_stored(monkeypatch, capsys):
    monkeypatch.setattr(ls, "read", lambda ago=None: (None, {}))
    monkeypatch.setattr(sys, "argv", ["loop_snapshot.py", "show"])
    ls.main()
    assert capsys.readouterr().out.strip() == "no snapshot yet"


def test_marketing_week_is_kept_by_hand_on_its_own_day(monkeypatch):
    kept = []
    monkeypatch.setattr(ls, "store", lambda kind, body, day=None: kept.append((kind, body, day)))
    monkeypatch.setattr(sys, "argv", ["loop_snapshot.py", "keep", "marketing_week", "2026-W45", "--day", "2026-11-02"])
    ls.main()
    assert kept == [("marketing_week", "2026-W45", ls.date(2026, 11, 2))]


def test_last_says_when_a_kind_was_kept(monkeypatch, capsys):
    monkeypatch.setattr(ls, "last", lambda kind: (None, None))
    monkeypatch.setattr(sys, "argv", ["loop_snapshot.py", "last", "marketing_week"])
    ls.main()
    assert "no marketing_week in the last 30 days" in capsys.readouterr().out
    loop_bridge.validate(Job(script="loop_snapshot", args=["last", "marketing_week"]))
