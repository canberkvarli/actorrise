"""The App Store analytics report lookup: names across pages, and a name that drifted in case."""
import unittest

import httpx

from app.services import app_store_connect as asc


def _client(pages):
    def handler(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params.get("page", "0"))
        data = [{"id": f"r{page}{i}", "attributes": {"name": n}} for i, n in enumerate(pages[page])]
        links = {"next": f"https://api.example/v1/reports?page={page + 1}"} if page + 1 < len(pages) else {}
        return httpx.Response(200, json={"data": data, "links": links})

    return httpx.Client(base_url="https://api.example", transport=httpx.MockTransport(handler))


class ReportLookup(unittest.TestCase):
    def test_finds_a_name_on_a_later_page(self):
        with _client([["App Sessions"], [asc.DOWNLOADS_REPORT]]) as c:
            self.assertEqual(asc._report_id(c, "req", asc.DOWNLOADS_REPORT), "r10")

    def test_matches_a_name_whose_case_changed(self):
        with _client([[asc.ENGAGEMENT_REPORT.upper()]]) as c:
            self.assertEqual(asc._report_id(c, "req", asc.ENGAGEMENT_REPORT), "r00")

    def test_missing_report_is_none(self):
        with _client([["App Sessions"]]) as c:
            self.assertIsNone(asc._report_id(c, "req", asc.ENGAGEMENT_REPORT))


if __name__ == "__main__":
    unittest.main()
