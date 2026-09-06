"""How long a piece may be is a rights question, not a quality one.

The 400-word ceiling is where a fair-use excerpt stops being an excerpt. It was
applied to everything, including plays published in the 1890s, where it has no
basis at all.

That cost exactly what the library was shortest of. 21% of the speeches in the
Perseus Greek drama corpus run past 400 words -- Sophocles' Ajax at 492,
Euripides' Medea at 472 -- and those are the three-and-four-minute pieces that a
week of scraping never moved: 254 in the 3-4 minute band, 12 above four, flat
throughout. Every one of them was being rejected as `too_long` by a rule written
for somebody else's copyright.

An actor cuts a long speech down. They cannot lengthen one that was never
stored.
"""

import unittest

from app.services.licensing import (
    EXCERPT_MAX_WORDS,
    PUBLIC_DOMAIN_MAX_WORDS,
    max_words_for,
)


class RightsDrivenCeilingTests(unittest.TestCase):
    def test_public_domain_is_not_bound_by_the_excerpt_rule(self):
        self.assertEqual(max_words_for("public_domain", "public_domain"),
                         PUBLIC_DOMAIN_MAX_WORDS)

    def test_fair_use_keeps_the_legal_ceiling(self):
        """This one IS a legal bound and must not move."""
        self.assertEqual(max_words_for("copyrighted", "fair_use"),
                         EXCERPT_MAX_WORDS)

    def test_a_signed_licence_is_not_an_excerpt(self):
        """Written permission says what it says; 400 words is not in it."""
        self.assertEqual(max_words_for("copyrighted", "licensed"),
                         PUBLIC_DOMAIN_MAX_WORDS)

    def test_the_actors_own_upload_is_their_own(self):
        self.assertEqual(max_words_for("user_uploaded", "user_content"),
                         PUBLIC_DOMAIN_MAX_WORDS)

    def test_unknown_rights_fail_closed(self):
        """A source that cannot say what the basis is gets the tightest bound."""
        for status, licence in [("copyrighted", None), ("unknown", None),
                                (None, None), ("", "")]:
            self.assertEqual(max_words_for(status, licence), EXCERPT_MAX_WORDS,
                             f"{status}/{licence} should fail closed")

    def test_the_public_domain_ceiling_is_a_real_audition_length(self):
        """~6 minutes at 150wpm. Long, but a speech an actor can cut."""
        self.assertGreater(PUBLIC_DOMAIN_MAX_WORDS, EXCERPT_MAX_WORDS)
        self.assertLessEqual(PUBLIC_DOMAIN_MAX_WORDS, 1200)


class IngestUsesTheRightCeilingTests(unittest.TestCase):
    """ingest_play must ask the rights rather than take a fixed default.

    The ceiling arrives at the parser AND at assess_monologue_quality, so a
    default baked into the signature would silently cap public-domain work even
    once max_words_for existed.
    """

    def test_ingest_play_defaults_to_asking_the_rights(self):
        import inspect

        from app.services.data_ingestion.pipeline import ingest_play

        default = inspect.signature(ingest_play).parameters["max_words"].default
        self.assertIsNone(
            default,
            "max_words must default to None so the rights decide, not a literal",
        )


if __name__ == "__main__":
    unittest.main()
