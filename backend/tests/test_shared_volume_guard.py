"""The guard that stops one anthology being mined once per play row.

This is the mechanism behind every collapse the corpus has had. When several
play rows share a source_url, that URL is an anthology: re-fetching it returns
the whole book, not the play. Extract from it once per row and every play in
the volume ends up with an identical set of speeches under its own title.

Evidence, all real:
  - Gutenberg 37970 — 18 rows (THE BOOR, THE STRONGER, HYACINTH HALVEY...),
    each holding the same 52 monologues.
  - Gutenberg 36984 — 51 rows.
  - Gutenberg 8499 — The Father / Miss Julie / The Outlaw, the collapse fixed
    in 2026-07.
  - Gutenberg 31 — Antigone / Oedipus at Colonus.

A dry run on 2026-08-21 offered to insert 27 identical speeches into each of
those 18 plays, hours after they had been cleaned out. With the guard the same
run drops from 719 candidates to 231.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "extract_pd_monologues",
    Path(__file__).resolve().parent.parent / "scripts" / "extract_pd_monologues.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["extract_pd_monologues"] = _mod
_spec.loader.exec_module(_mod)

_get_play_text = _mod._get_play_text
body_looks_foreign = _mod.body_looks_foreign

ANTHOLOGY = "https://www.gutenberg.org/files/37970/37970-h/37970-h.htm"
OWN_BOOK = "https://www.gutenberg.org/ebooks/779"


class FakePlay:
    def __init__(self, full_text=None, source_url=None, full_text_url=None):
        self.full_text = full_text
        self.source_url = source_url
        self.full_text_url = full_text_url


class ExplodingScraper:
    """Any download at all is a failure of the guard."""

    def download_text(self, _book_id):
        raise AssertionError("re-fetched a shared anthology URL")


class TestSharedVolumeGuard:
    def test_shared_url_is_not_refetched(self):
        play = FakePlay(source_url=ANTHOLOGY)
        assert _get_play_text(play, ExplodingScraper(), {ANTHOLOGY}) is None

    def test_front_matter_stub_does_not_defeat_the_guard(self):
        # The 18 anthology rows each carry ~2kB of front matter, which is under
        # the 5,000-char bar, so the code falls through to the re-fetch. That
        # fall-through is exactly the bug.
        play = FakePlay(full_text="PERSONS " + ("x " * 200), source_url=ANTHOLOGY)
        assert _get_play_text(play, ExplodingScraper(), {ANTHOLOGY}) is None

    def test_a_rows_own_full_text_is_still_used(self):
        # Text stored per play is fine — it was never the volume. Doctor
        # Faustus has its own 127kB and its own Gutenberg id, and yielded 20
        # real monologues.
        own = "FAUSTUS. " + ("word " * 2000)
        play = FakePlay(full_text=own, source_url=ANTHOLOGY)
        assert _get_play_text(play, ExplodingScraper(), {ANTHOLOGY}) == own

    def test_unshared_url_is_allowed_through_to_fetch(self):
        play = FakePlay(source_url=OWN_BOOK)
        with pytest.raises(AssertionError):
            # Reaching the scraper is correct here: this URL belongs to one
            # play, so the download is the play.
            _get_play_text(play, ExplodingScraper(), {ANTHOLOGY})

    def test_no_shared_set_behaves_as_before(self):
        play = FakePlay(source_url=OWN_BOOK)
        with pytest.raises(AssertionError):
            _get_play_text(play, ExplodingScraper(), None)


class TestForeignBodyDetection:
    def test_english_licence_header_does_not_mask_a_foreign_body(self):
        # Gutenberg files open in English whatever language the play is in.
        # Sampling only the head passed a Swedish Euripides and a German
        # Salome as English; both would have been ingested as English.
        header = (
            "This eBook is for the use of anyone anywhere at no cost and with "
            "almost no restrictions whatsoever. You may copy it, give it away "
            "or re-use it under the terms of the Project Gutenberg License "
            "included with this eBook or online at www.gutenberg.org. "
        ) * 6
        swedish = (
            "Ratt sade du min flicka och jag lyder dig och sander egen dotter "
            "dit ty ratt du sagt kom ut mitt barn Hermione kom ut pastund tag "
            "gjuteoffret har i handren och kransen som du bar i lockigt har. "
        ) * 40
        assert body_looks_foreign(header + swedish) is True

    def test_english_play_is_not_flagged(self):
        english = (
            "Now that the gloomy shadow of the earth, longing to view Orion's "
            "drizzling look, leaps from the antarctic world unto the sky and "
            "dims the welkin with her pitchy breath, Faustus, begin thine "
            "incantations and try if devils will obey thy hest. "
        ) * 40
        assert body_looks_foreign(english) is False

    def test_short_text_is_not_guessed_at(self):
        assert body_looks_foreign("Too short to judge.") is False
        assert body_looks_foreign("") is False
