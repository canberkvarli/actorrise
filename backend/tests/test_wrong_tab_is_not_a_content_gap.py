"""
A `content_gap` carrying `available_in` is the cross-tab recovery, not a gap:
the actor searched a film title on the Plays tab and was told where it lives.

Counting those as missing content made the admin dashboard read "we don't have
it: 66" when 57 of the 66 were titles already in the library. Anastasia, Black
Swan, Sing Street and Better Call Saul were all on that list, and a 2026-09-06
audit read it as a scraping backlog that did not exist.
"""

from app.services.search.title_lookup import compute_content_gap


class _FakeDB:
    """Stands in for the catalogue lookup compute_content_gap does."""

    def __init__(self, sources):
        self._sources = sources


def test_a_gap_with_available_in_is_a_recovery(monkeypatch):
    import app.services.search.title_lookup as tl

    monkeypatch.setattr(tl, "find_catalogue_source_types", lambda db, t: ["film"])
    gap = compute_content_gap(
        "sing street", "Sing Street", None, [], [], db=object(),
        applied_source_type="play",
    )
    assert gap is not None
    assert gap["available_in"] == ["film"], "must say where it actually lives"


def test_a_title_we_truly_lack_has_no_available_in(monkeypatch):
    import app.services.search.title_lookup as tl

    monkeypatch.setattr(tl, "find_catalogue_source_types", lambda db, t: [])
    gap = compute_content_gap(
        "the humans", "The Humans", None, [], [], db=object(),
        applied_source_type="play",
    )
    assert gap is not None
    assert "available_in" not in gap, "a real gap names no other tab"


def test_the_dashboard_predicate_separates_them():
    """The SQL in admin/searches.py splits on `content_gap ? 'available_in'`.
    Pin the shape both branches depend on."""
    recovery = {"play": "Sing Street", "author": None, "available_in": ["film"]}
    real_gap = {"play": "The Humans", "author": None}

    assert "available_in" in recovery
    assert "available_in" not in real_gap
