"""Tests for source_url array-literal repair.

ActorRise carries the monologue and links out to the original script. On 295 of
1,729 plays that link was dead: the scraper collected candidate URLs as a list
and the whole Postgres array literal was stringified into a varchar column, so
the browser received href="{https://imsdb.com/..." and went nowhere. Nothing
errored — a varchar accepts any string, the column just stopped meaning what it
says.

The parsing has to handle quoting, because the alternates routinely contain
commas ("Italian-Job,-The.html"). A plain split(",") cuts a URL in half and
produces a link that looks valid and is not, which is worse than the bug.
"""

import importlib.util
import sys
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "fix_source_urls",
    Path(__file__).resolve().parent.parent / "scripts" / "fix_source_urls.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["fix_source_urls"] = _mod
_spec.loader.exec_module(_mod)

parse_pg_array = _mod.parse_pg_array
first_url = _mod.first_url


class TestParsing:
    def test_single_element(self):
        assert parse_pg_array("{https://imsdb.com/scripts/Insomnia.html}") == [
            "https://imsdb.com/scripts/Insomnia.html"
        ]

    def test_quoted_element_containing_a_comma(self):
        raw = ('{https://imsdb.com/scripts/The-Italian-Job.html,'
               '"https://imsdb.com/scripts/Italian-Job,-The.html"}')
        parts = parse_pg_array(raw)
        assert parts == [
            "https://imsdb.com/scripts/The-Italian-Job.html",
            "https://imsdb.com/scripts/Italian-Job,-The.html",
        ]
        # The comma-bearing alternate must survive whole. Splitting it yields
        # ".../Italian-Job" — a URL shaped right and pointing nowhere.
        assert parts[1].endswith("-The.html")

    def test_empty_array(self):
        assert parse_pg_array("{}") == []

    def test_not_an_array_is_returned_as_one_element(self):
        assert parse_pg_array("https://example.com/a") == ["https://example.com/a"]


class TestUrlSelection:
    def test_takes_the_first_valid_url(self):
        raw = ('{https://imsdb.com/scripts/The-Matrix.html,'
               '"https://imsdb.com/scripts/Matrix,-The.html"}')
        assert first_url(raw) == "https://imsdb.com/scripts/The-Matrix.html"

    def test_skips_junk_before_a_real_url(self):
        assert first_url('{n/a,https://example.com/script.html}') == \
            "https://example.com/script.html"

    def test_no_usable_url_returns_none(self):
        # The caller leaves these alone rather than blanking them: a broken
        # link is still evidence of where the text came from.
        assert first_url("{}") is None
        assert first_url("{n/a,unknown}") is None

    def test_rejects_non_http_schemes(self):
        assert first_url("{ftp://example.com/x,file:///tmp/y}") is None
