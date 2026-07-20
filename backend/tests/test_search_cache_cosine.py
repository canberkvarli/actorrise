"""Tests for search-result cache encoding that preserves best_cosine.

Live-telemetry gap (2026-07-20): a repeat search served from the result
cache logged best_cosine = NULL, because the raw cosine of the best hit was
never persisted in the cache payload (per-result scores are rank-based, not
real cosine, so it can't be recovered from them). encode/decode now carry it,
with backward compatibility for the two older payload shapes.
"""

import unittest

from app.services.search.semantic_search import (
    decode_search_cache,
    encode_search_cache,
)


class SearchCacheCodecTests(unittest.TestCase):
    def test_roundtrip_preserves_rows_and_cosine(self):
        rows = [[5, 0.9, ""], [6, 0.8, "exact_quote"]]
        out_rows, cos = decode_search_cache(encode_search_cache(rows, 0.512))
        self.assertEqual(out_rows, rows)
        self.assertEqual(cos, 0.512)

    def test_none_cosine_roundtrips(self):
        _, cos = decode_search_cache(encode_search_cache([[1, 0.5, ""]], None))
        self.assertIsNone(cos)

    def test_legacy_list_of_rows_has_no_cosine(self):
        rows, cos = decode_search_cache([[1, 0.9, ""], [2, 0.8, ""]])
        self.assertEqual(rows, [[1, 0.9, ""], [2, 0.8, ""]])
        self.assertIsNone(cos)

    def test_legacy_list_of_ids(self):
        rows, cos = decode_search_cache([1, 2, 3])
        self.assertEqual(rows, [1, 2, 3])
        self.assertIsNone(cos)

    def test_empty_or_none_is_safe(self):
        self.assertEqual(decode_search_cache(None), ([], None))
        self.assertEqual(decode_search_cache([]), ([], None))


if __name__ == "__main__":
    unittest.main()
