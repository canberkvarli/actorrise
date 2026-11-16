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


    def test_email_templates_print_the_name(self):
        # {{ brand }} renders empty, not an error, if the global is missing.
        from app.services.email.templates import EmailTemplates

        html = EmailTemplates().render_submission_received(user_name="Sam", monologue_title="Hamlet")
        self.assertIn("ActorRise", html)
        self.assertNotIn("{{", html)
        self.assertIn("https://actorrise.com/logo_with_text.png", html)

    def test_cue_prompt_has_the_name_filled(self):
        from app.services.cue import agent

        agent.system_prompt.cache_clear()
        prompt = agent.system_prompt()
        self.assertNotIn("{brand}", prompt)
        self.assertIn("inside ActorRise", prompt)

    def test_audition_prompt_formats(self):
        from app.services.auditions import assist

        text = assist.ASK_PROMPT.format(brand="ActorRise", facts="{}", sides_block="", earlier="[]", question="q")
        self.assertIn("audition page in ActorRise", text)


if __name__ == "__main__":
    unittest.main()
