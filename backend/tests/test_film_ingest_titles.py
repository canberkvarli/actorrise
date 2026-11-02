"""A film's reference is found from its slug even when the title has an apostrophe."""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from ingest_film_monologues import _norm_title, match_ref  # noqa: E402


def test_an_apostrophe_folds_to_the_slug_spelling():
    assert _norm_title("Ferris Bueller's Day Off") == _norm_title("Ferris Buellers Day Off")
    assert _norm_title("To All the Boys I’ve Loved Before") == _norm_title("To All The Boys Ive Loved Before")


def test_a_slug_title_finds_its_apostrophe_reference():
    ref = types.SimpleNamespace(title="Ferris Bueller's Day Off", year=1986, director="John Hughes")
    refs = {_norm_title(ref.title): [ref]}
    assert match_ref(refs, "Ferris Buellers Day Off", 1986) is ref
