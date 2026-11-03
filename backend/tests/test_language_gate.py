"""The library's language gate (CAN-19).

Canberk, 2026-11-03: "if English speakers search something in English we don't
show Turkish monologues", and later the same day: "no Turkish actor can do
English pieces; they have to change the UI first." So the Turkish UI is served
Turkish only and everything else English only. The default (no request, no
header) is English, and these tests pin it as hard as the Turkish case.
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

    def test_turkish_ui_sees_turkish_only(self):
        # No English piece, and no unlabelled one (which is English).
        self.assertEqual(self.ids(TURKISH_LANGUAGES), {self.tr.id})

    def test_pending_turkish_stays_hidden_on_the_turkish_ui(self):
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
        self.assertTrue(language_hides(self.en, TURKISH_LANGUAGES))
        self.assertTrue(language_hides(self.unknown, TURKISH_LANGUAGES))
        self.assertFalse(language_hides(self.en))


class RequestLanguagesTests(unittest.TestCase):
    def req(self, headers):
        return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()})

    def test_no_header_is_english(self):
        self.assertEqual(request_languages(self.req({})), DEFAULT_LANGUAGES)

    def test_turkish_header_is_turkish_only(self):
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


class ClosestInLanguageTests(unittest.TestCase):
    """The Turkish page is never empty while the Turkish shelf has pieces (2026-11-03).

    SQLite has no vector distance, so these run the no-vector branch (the
    embedding call fails); the gates are the same either way.
    """

    def setUp(self):
        from unittest import mock

        from app.services.search.semantic_search import SemanticSearch

        self.db, self.saved = memory_db([FilmTvReference, Play, Monologue])
        en, tr = _play(self.db, "Hamlet", "en"), _play(self.db, "Antigone", "tr")
        vec = [0.1] * 1536
        self.en = _mono(self.db, en, "Hamlet")
        self.tr_f = _mono(self.db, tr, "Antigone")
        self.tr_m = _mono(self.db, tr, "Kreon")
        self.tr_pending = _mono(self.db, tr, "İsmene", status="pending")
        self.tr_no_vec = _mono(self.db, tr, "Koro")
        for m in (self.en, self.tr_f, self.tr_m, self.tr_pending):
            m.embedding_vector = vec
        self.tr_f.character_gender = "female"
        self.tr_m.character_gender = "male"
        self.db.commit()
        self.patch = mock.patch(
            "app.services.ai.langchain.embeddings.generate_embedding",
            side_effect=RuntimeError("no network in tests"),
        )
        self.patch.start()
        self.svc = SemanticSearch(self.db, languages=TURKISH_LANGUAGES)

    def tearDown(self):
        self.patch.stop()
        self.db.close()
        restore(self.saved)

    def test_turkish_shelf_only_released_and_embedded(self):
        ids = {m.id for m in self.svc.closest_in_language("anything at all")}
        self.assertEqual(ids, {self.tr_f.id, self.tr_m.id})

    def test_gender_is_kept(self):
        self.svc._last_gender = "female"
        ids = {m.id for m in self.svc.closest_in_language("kadın monoloğu")}
        self.assertEqual(ids, {self.tr_f.id})

    def test_english_request_never_gets_turkish(self):
        from app.services.search.semantic_search import SemanticSearch

        svc = SemanticSearch(self.db, languages=DEFAULT_LANGUAGES)
        ids = {m.id for m in svc.closest_in_language("anything")}
        self.assertNotIn(self.tr_f.id, ids)
        self.assertNotIn(self.tr_m.id, ids)
