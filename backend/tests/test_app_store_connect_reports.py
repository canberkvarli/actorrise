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

    def test_prefers_the_standard_variant_apple_files_it_under(self):
        names = [f"{asc.ENGAGEMENT_REPORT} Detailed", f"{asc.ENGAGEMENT_REPORT} Standard"]
        with _client([names]) as c:
            self.assertEqual(asc._report_id(c, "req", asc.ENGAGEMENT_REPORT), "r01")

    def test_downloads_under_its_other_name(self):
        with _client([["App Sessions Standard", "App Downloads Standard"]]) as c:
            self.assertEqual(asc._report_id(c, "req", asc.DOWNLOADS_REPORT), "r01")

    def test_missing_report_is_none(self):
        with _client([["App Sessions"]]) as c:
            self.assertIsNone(asc._report_id(c, "req", asc.ENGAGEMENT_REPORT))


if __name__ == "__main__":
    unittest.main()


class DailyInstances(unittest.TestCase):
    def test_no_sort_param_and_newest_days_first_across_pages(self):
        pages = [["2026-11-10", "2026-11-18"], ["2026-11-19", "2026-11-01"]]
        seen = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(dict(request.url.params))
            page = int(request.url.params.get("page", "0"))
            data = [{"id": d, "attributes": {"processingDate": d}} for d in pages[page]]
            links = {"next": f"https://api.example/v1/x?page={page + 1}"} if page + 1 < len(pages) else {}
            return httpx.Response(200, json={"data": data, "links": links})

        with httpx.Client(base_url="https://api.example", transport=httpx.MockTransport(handler)) as c:
            got = asc._daily_instances(c, "rep", 2)
        self.assertEqual([i["id"] for i in got], ["2026-11-19", "2026-11-18"])
        self.assertTrue(all("sort" not in p for p in seen))
