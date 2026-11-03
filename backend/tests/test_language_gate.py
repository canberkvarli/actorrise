"""The library's language gate (CAN-19).

Canberk, 2026-11-03: "if English speakers search something in English we don't
show Turkish monologues." The safety is the default: everything is English only
unless a request from the Turkish UI widens it, so these tests pin the default
as hard as the widened case.
"""

import unittest
from types import SimpleNamespace

from app.api.monologues import request_languages
from app.models.actor import FilmTvReference, Monologue, Play
from app.services.search.semantic_search import (
    DEFAULT_LANGUAGES,
    TURKISH_LANGUAGES,
    exclude_hidden,
    language_hides,
    query_is_turkish,
)
from tests.dbfixture import memory_db, restore


def _play(db, title, language):
    p = Play(title=title, author="William Shakespeare", genre="tragedy", category="classical",
             copyright_status="public_domain", language=language, source_type="play")
    db.add(p)
    db.flush()
    return p


def _mono(db, play, character, status=None):
    m = Monologue(play_id=play.id, title=f"{character} speech", character_name=character,
                  text="word " * 120, word_count=120, estimated_duration_seconds=48,
                  review_status=status)
    db.add(m)
    db.flush()
    return m


class LanguageGateQueryTests(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([FilmTvReference, Play, Monologue])
        en, tr, unknown, nl = (_play(self.db, "Hamlet", "en"), _play(self.db, "Hamlet", "tr"),
                               _play(self.db, "Macbeth", None), _play(self.db, "Peer Gynt", "nl"))
        self.en = _mono(self.db, en, "Hamlet")
        self.tr = _mono(self.db, tr, "Hamlet")
        self.tr_pending = _mono(self.db, tr, "Ophelia", status="pending")
        self.unknown = _mono(self.db, unknown, "Macbeth")
        self.nl = _mono(self.db, nl, "Peer")
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def ids(self, languages=None):
        q = self.db.query(Monologue)
        q = exclude_hidden(q) if languages is None else exclude_hidden(q, languages)
        return {m.id for m in q.all()}

    def test_default_is_english_only(self):
        # The default is what every endpoint but /search uses, and what /search
        # uses for anyone not on the Turkish UI.
        self.assertEqual(self.ids(), {self.en.id, self.unknown.id})

    def test_explicit_english_matches_the_default(self):
        self.assertEqual(self.ids(DEFAULT_LANGUAGES), self.ids())

    def test_turkish_ui_sees_both_libraries(self):
        self.assertEqual(self.ids(TURKISH_LANGUAGES), {self.en.id, self.tr.id, self.unknown.id})

    def test_pending_turkish_stays_hidden_even_when_widened(self):
        self.assertNotIn(self.tr_pending.id, self.ids(TURKISH_LANGUAGES))

    def test_other_foreign_plays_stay_out(self):
        self.assertNotIn(self.nl.id, self.ids(TURKISH_LANGUAGES))
        self.assertNotIn(self.nl.id, self.ids())

    def test_unlabelled_plays_count_as_english(self):
        self.assertIn(self.unknown.id, self.ids())

    def test_row_level_twin_agrees(self):
        # title_lookup and Cue filter loaded rows with language_hides; it must
        # draw the same line as the SQL gate.
        self.assertFalse(language_hides(self.en))
        self.assertFalse(language_hides(self.unknown))
        self.assertTrue(language_hides(self.nl))
        self.assertTrue(language_hides(self.tr))
        self.assertFalse(language_hides(self.tr, TURKISH_LANGUAGES))
        self.assertFalse(language_hides(self.en))


class RequestLanguagesTests(unittest.TestCase):
    def req(self, headers):
        return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()})

    def test_no_header_is_english(self):
        self.assertEqual(request_languages(self.req({})), DEFAULT_LANGUAGES)

    def test_turkish_header_widens(self):
        self.assertEqual(request_languages(self.req({"X-ActorRise-Locale": "tr"})), TURKISH_LANGUAGES)
        self.assertEqual(request_languages(self.req({"X-ActorRise-Locale": " TR "})), TURKISH_LANGUAGES)

    def test_anything_else_is_english(self):
        for value in ("en", "", "tr-TR", "fr", "tr,en"):
            with self.subTest(value=value):
                self.assertEqual(request_languages(self.req({"X-ActorRise-Locale": value})), DEFAULT_LANGUAGES)


class TurkishQueryDetectionTests(unittest.TestCase):
    def test_turkish_queries(self):
        for q in ("komik monolog kadın", "ihanet üzerine", "dramatik erkek", "kadınlar"):
            with self.subTest(q=q):
                self.assertTrue(query_is_turkish(q))

    def test_english_queries_are_not_turkish(self):
        # "film" and "drama" are in the Turkish vocabulary too; they must not
        # tip an English query into the Turkish boost.
        for q in ("funny monologue for a woman", "film monologue", "drama school audition",
                  "Hamlet", "Schrödinger", "to be or not to be"):
            with self.subTest(q=q):
                self.assertFalse(query_is_turkish(q))


if __name__ == "__main__":
    unittest.main()
