"""The site moves to ghostlight.actor; the API must take browser calls from it,
and keep taking them from actorrise.com, or every request from the site fails."""

import re
import unittest
from pathlib import Path

SRC = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text()
REGEX = re.search(r'^CORS_ORIGIN_REGEX = r"(.+)"$', SRC, re.M).group(1)


class CorsOriginTest(unittest.TestCase):
    def test_allowed(self):
        for origin in ("https://ghostlight.actor", "https://www.ghostlight.actor",
                       "https://actorrise.com", "https://www.actorrise.com",
                       "https://actorrise-git-x.vercel.app"):
            self.assertRegex(origin, REGEX)

    def test_refused(self):
        for origin in ("http://ghostlight.actor", "https://evilghostlight.actor",
                       "https://ghostlight.actor.evil.com", "https://ghostlight.app"):
            self.assertIsNone(re.match(REGEX, origin), origin)


if __name__ == "__main__":
    unittest.main()
