"""The brand lives in app/core/brand.py: Ghost Light at ghostlight.actor since
2026-11-16, and the SITE_URL env still wins."""

import os
import unittest
from unittest import mock

from app.core import brand


class BrandTest(unittest.TestCase):
    def test_defaults(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SITE_URL", None)
            self.assertEqual(brand.site_url(), "https://ghostlight.actor")
        self.assertEqual(brand.BRAND_NAME, "Ghost Light")

    def test_env_wins(self):
        with mock.patch.dict(os.environ, {"SITE_URL": "https://preview.example.com"}):
            self.assertEqual(brand.site_url(), "https://preview.example.com")

    def test_email_templates_print_the_name(self):
        # {{ brand }} renders empty, not an error, if the global is missing.
        from app.services.email.templates import EmailTemplates

        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SITE_URL", None)
            html = EmailTemplates().render_submission_received(user_name="Sam", monologue_title="Hamlet")
        self.assertIn("Ghost Light", html)
        self.assertNotIn("{{", html)
        self.assertIn("https://ghostlight.actor/logo_with_text.png", html)

    def test_cue_prompt_has_the_name_filled(self):
        from app.services.cue import agent

        agent.system_prompt.cache_clear()
        prompt = agent.system_prompt()
        self.assertNotIn("{brand}", prompt)
        self.assertIn("inside Ghost Light", prompt)

    def test_audition_prompt_formats(self):
        from app.services.auditions import assist

        text = assist.ASK_PROMPT.format(brand=brand.BRAND_NAME, facts="{}", sides_block="", earlier="[]", question="q")
        self.assertIn("audition page in Ghost Light", text)


if __name__ == "__main__":
    unittest.main()
