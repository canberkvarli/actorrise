"""Tag normalising for community-shared scripts."""

from __future__ import annotations

import pytest

from app.services.script_tags import (
    MAX_TAGS_PER_SCRIPT,
    normalize_tag,
    normalize_tag_list,
)


class TestNormalizeTag:
    @pytest.mark.parametrize("raw,expected", [
        ("Two Hander", "two-hander"),
        ("two_hander", "two-hander"),
        ("two-hander!", "two-hander"),
        ("  TWO   HANDER  ", "two-hander"),
        ("Contemporary", "contemporary"),
        ("audition gold", "audition-gold"),
    ])
    def test_variants_collapse_to_one_tag(self, raw, expected):
        assert normalize_tag(raw) == expected

    @pytest.mark.parametrize("raw", ["", "  ", "a", "123", "---", "!!!", "x" * 33])
    def test_unusable_rejected(self, raw):
        assert normalize_tag(raw) is None

    def test_digits_allowed_alongside_letters(self):
        assert normalize_tag("2 person") == "2-person"

    def test_repeated_separators_collapse(self):
        assert normalize_tag("two   ---   hander") == "two-hander"


class TestNormalizeTagList:
    def test_dedupes_variants(self):
        assert normalize_tag_list(["Two Hander", "two_hander", "TWO-HANDER"]) == ["two-hander"]

    def test_preserves_owner_order(self):
        assert normalize_tag_list(["drama", "contemporary"]) == ["drama", "contemporary"]

    def test_drops_unusable_but_keeps_rest(self):
        assert normalize_tag_list(["drama", "!!!", "comedy"]) == ["drama", "comedy"]

    def test_caps_the_list(self):
        many = [f"tag{i}" for i in range(20)]
        assert len(normalize_tag_list(many)) == MAX_TAGS_PER_SCRIPT

    def test_empty_and_none(self):
        assert normalize_tag_list([]) == []
        assert normalize_tag_list(None) == []
