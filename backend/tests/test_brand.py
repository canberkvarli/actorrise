"""The brand lives in app/core/brand.py. Until the switch to Ghost Light it must
read exactly as the hardcoded values it replaced, and SITE_URL must still win."""

import os
import unittest
from unittest import mock

from app.core import brand


class BrandTest(unittest.TestCase):
    def test_defaults_match_what_was_hardcoded(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SITE_URL", None)
            self.assertEqual(brand.site_url(), "https://actorrise.com")
        self.assertEqual(brand.BRAND_NAME, "ActorRise")

    def test_env_wins(self):
        with mock.patch.dict(os.environ, {"SITE_URL": "https://ghostlight.actor"}):
            self.assertEqual(brand.site_url(), "https://ghostlight.actor")


if __name__ == "__main__":
    unittest.main()
