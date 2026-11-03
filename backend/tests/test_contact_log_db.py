"""The contact record lives in the database, so the brief must read it from there."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import contact_log as cl  # noqa: E402
import conversion_brief as cb  # noqa: E402


class _Conn:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_a, **_k):
        return [(a,) for a in self.rows]


def test_the_brief_leaves_out_everyone_in_the_table(monkeypatch, tmp_path):
    monkeypatch.setattr(cb, "WRITTEN", tmp_path / "absent.txt")
    assert cb.written_to(_Conn(["a@x.com", "b@y.com"])) == ["a@x.com", "b@y.com"]


def test_the_file_and_the_table_are_one_list(monkeypatch, tmp_path):
    f = tmp_path / "written.txt"
    f.write_text("a@x.com   # 2026-11-01 note\nnot an address\n")
    monkeypatch.setattr(cb, "WRITTEN", f)
    assert cb.written_to(_Conn(["a@x.com", "c@z.com"])) == ["a@x.com", "c@z.com"]


def test_nobody_written_to_is_still_valid_sql(monkeypatch, tmp_path):
    monkeypatch.setattr(cb, "WRITTEN", tmp_path / "absent.txt")
    assert cb.written_to(_Conn([])) == ["nobody@nowhere"]


def test_a_check_finds_a_colleague_by_domain(monkeypatch):
    monkeypatch.setattr(cl, "_rows", lambda: [{"address": "t@school.org", "domain": "school.org",
                                               "organization": "", "kind": "educator", "source": "db"}])
    assert cl.check("other@school.org", None)[0]["why"].startswith("same organisation domain")
    assert cl.check("someone@gmail.com", None) == []


def test_dates_come_from_free_text():
    assert str(cl._date("2026-11-02 SENT hello")) == "2026-11-02"
    assert cl._date("DRAFTED, not sent") is None


def test_due_is_reachable_through_the_bridge():
    from app.api import loop_bridge
    assert "due" in loop_bridge.ALLOWED["contact_log"]
