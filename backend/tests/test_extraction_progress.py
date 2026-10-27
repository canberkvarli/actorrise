"""A background read says where it has got to and about how long it takes."""

from app.api import scripts


def test_progress_is_noted_only_for_a_read_in_flight():
    scripts._EXTRACTION_PROGRESS.pop(7, None)
    scripts._note_progress(7, "Mapping acts")  # nothing in flight: nothing kept
    assert 7 not in scripts._EXTRACTION_PROGRESS
    scripts._EXTRACTION_PROGRESS[7] = {"started": 0, "pages": 3, "step": "Opening"}
    scripts._note_progress(7, "Mapping acts")
    assert scripts._EXTRACTION_PROGRESS[7]["step"] == "Mapping acts"
    scripts._EXTRACTION_PROGRESS.pop(7, None)


def test_estimate_grows_with_pages_and_is_capped():
    assert scripts._estimate_seconds(1) < scripts._estimate_seconds(20)
    assert scripts._estimate_seconds(10_000) == 600
