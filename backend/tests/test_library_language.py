"""The Turkish UI is served Turkish only, everywhere (CAN-19, 2026-11-03).

Canberk: "no Turkish actor can do English pieces; they have to change the UI
first", and "the ScenePartner too, and the community library too, everything".
So the request's language (X-ActorRise-Locale, set once by the middleware)
gates monologues, library and sample scenes, the community library, the
community shelf and the feed. No header, or no request at all, is English.

Every case pins English as hard as Turkish.
"""
import unittest
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.actor import FilmTvReference, Monologue, Play, Scene, UserScript
from app.models.organization import Organization
from app.models.shelf import ShelfScene
from app.models.user import User
from app.services.library_language import (
    DEFAULT_LANGUAGES,
    TURKISH_LANGUAGES,
    LibraryLanguageMiddleware,
    current_languages,
    languages_for_locale,
    play_id_clause,
    reset_request_languages,
    script_clause,
    set_request_languages,
)
from tests.dbfixture import memory_db, restore

TURKISH = (
    "Olmak ya da olmamak, işte bütün mesele bu. Hangisi daha soylu: zalim talihin "
    "taşlarına, oklarına katlanmak mı, yoksa bir dert denizine karşı silaha sarılıp "
    "o dertlere son vermek mi? Ben de bilmiyorum, değil mi?"
)
ENGLISH = "To be, or not to be, that is the question: whether 'tis nobler in the mind to suffer. " * 3


class Languages(unittest.TestCase):
    def test_locale(self):
        self.assertEqual(languages_for_locale("tr"), ("tr",))
        self.assertEqual(languages_for_locale(" TR "), ("tr",))
        for other in (None, "", "en", "tr-TR", "fr"):
            self.assertEqual(languages_for_locale(other), ("en",), other)

    def test_outside_a_request_is_english(self):
        self.assertEqual(current_languages(), DEFAULT_LANGUAGES)


class Middleware(unittest.TestCase):
    def setUp(self):
        app = FastAPI()

        @app.get("/async")
        async def a():
            return list(current_languages())

        @app.get("/sync")
        def s():  # runs in a worker thread: the value must travel with it
            return list(current_languages())

        app.add_middleware(LibraryLanguageMiddleware)
        self.client = TestClient(app)

    def test_turkish_header_is_turkish_only(self):
        for path in ("/async", "/sync"):
            self.assertEqual(self.client.get(path, headers={"X-ActorRise-Locale": "tr"}).json(), ["tr"], path)

    def test_no_header_is_english(self):
        for path in ("/async", "/sync"):
            self.assertEqual(self.client.get(path).json(), ["en"], path)
            self.assertEqual(self.client.get(path, headers={"X-ActorRise-Locale": "en"}).json(), ["en"], path)

    def test_nothing_leaks_past_the_request(self):
        self.client.get("/sync", headers={"X-ActorRise-Locale": "tr"})
        self.assertEqual(current_languages(), DEFAULT_LANGUAGES)


class Library(unittest.TestCase):
    """Scenes, scripts and the shelf, under each request language."""

    def setUp(self):
        self.db, self.saved = memory_db([Organization, User, FilmTvReference, Play, UserScript, Scene, ShelfScene])
        self.user = User(email="a@example.com", supabase_id="s1")
        self.db.add(self.user)
        self.db.flush()
        self.en_play = self._play("Hamlet", None)       # unmarked: English
        self.tr_play = self._play("Hamlet", "tr")
        self.en_script = self._script("Almost a Therapist")
        self.tr_script = self._script("Şirin")
        self.en_scene = self._scene(self.en_play, self.en_script)
        self.tr_scene = self._scene(self.tr_play, self.tr_script)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _play(self, title, language):
        p = Play(title=title, author="A", genre="drama", category="classical",
                 copyright_status="public_domain", language=language, source_type="play")
        self.db.add(p)
        self.db.flush()
        return p

    def _script(self, title):
        s = UserScript(user_id=self.user.id, title=title, author="A", original_filename="x.txt",
                       file_type="txt", shared_with_community=True)
        self.db.add(s)
        self.db.flush()
        return s

    def _scene(self, play, script):
        sc = Scene(play_id=play.id, user_script_id=script.id, title="S", is_library=True,
                   character_1_name="A", character_2_name="B", line_count=2, estimated_duration_seconds=10)
        self.db.add(sc)
        self.db.flush()
        return sc

    def under(self, languages, fn):
        token = set_request_languages(languages)
        try:
            return fn()
        finally:
            reset_request_languages(token)

    def scenes(self):
        return {s.id for s in self.db.query(Scene).filter(play_id_clause(Scene.play_id))}

    def scripts(self):
        return {s.id for s in self.db.query(UserScript).filter(script_clause())}

    def test_scenes(self):
        self.assertEqual(self.scenes(), {self.en_scene.id})  # no request: English
        self.assertEqual(self.under(DEFAULT_LANGUAGES, self.scenes), {self.en_scene.id})
        self.assertEqual(self.under(TURKISH_LANGUAGES, self.scenes), {self.tr_scene.id})

    def test_community_scripts(self):
        self.assertEqual(self.under(DEFAULT_LANGUAGES, self.scripts), {self.en_script.id})
        self.assertEqual(self.under(TURKISH_LANGUAGES, self.scripts), {self.tr_script.id})

    def test_shelf(self):
        from app.api.shelf import _shelf_language_clause

        def shelf(play_id=None, source=None):
            row = ShelfScene(kind="scene", status="live", work_title="W", title="T",
                             character_1_name="A", character_2_name="B", play_id=play_id, source_scene_id=source)
            self.db.add(row)
            self.db.flush()
            return row.id

        named_en, named_tr = shelf(play_id=self.en_play.id), shelf(play_id=self.tr_play.id)
        copied_tr = shelf(source=self.tr_scene.id)
        bare = shelf()
        rows = lambda: {r.id for r in self.db.query(ShelfScene).filter(_shelf_language_clause())}  # noqa: E731
        self.assertEqual(self.under(DEFAULT_LANGUAGES, rows), {named_en, bare})
        self.assertEqual(self.under(TURKISH_LANGUAGES, rows), {named_tr, copied_tr})


class UploadsAreMarked(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([FilmTvReference, Play])

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def _play(self, text, language=None):
        p = Play(title="T", author="A", genre="drama", category="contemporary",
                 copyright_status="user_uploaded", source_type="play", full_text=text, language=language)
        self.db.add(p)
        self.db.commit()
        return p

    def test_a_turkish_upload_is_marked_turkish(self):
        self.assertEqual(self._play(TURKISH).language, "tr")

    def test_an_english_upload_is_written_as_before(self):
        self.assertEqual(self._play(ENGLISH).language, "en")
        self.assertEqual(self._play("").language, "en")

    def test_a_language_already_given_is_kept(self):
        self.assertEqual(self._play(ENGLISH, "tr").language, "tr")


class Feed(unittest.TestCase):
    def setUp(self):
        self.db, self.saved = memory_db([FilmTvReference, Play, Monologue])
        plays = {}
        for lang in ("en", "tr"):
            p = Play(title="Hamlet", author="A", genre="drama", category="classical",
                     copyright_status="public_domain", language=lang, source_type="play")
            self.db.add(p)
            self.db.flush()
            plays[lang] = p
        self.en_m = Monologue(play_id=plays["en"].id, title="x", character_name="H", text="w " * 100,
                              word_count=100, estimated_duration_seconds=40)
        self.tr_m = Monologue(play_id=plays["tr"].id, title="x", character_name="H", text="w " * 100,
                              word_count=100, estimated_duration_seconds=40)
        self.db.add_all([self.en_m, self.tr_m])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        restore(self.saved)

    def test_the_turkish_ui_sees_no_english_material(self):
        from app.api.community import _in_request_language

        def row(payload):
            return (SimpleNamespace(payload=payload), None, None)

        rows = [row({}), row({"tone": "comedic"}), row({"monologue_id": self.en_m.id}),
                row({"monologue_id": self.tr_m.id}), row({"title": "Almost a Therapist"})]
        token = set_request_languages(TURKISH_LANGUAGES)
        try:
            kept = _in_request_language(self.db, rows)
        finally:
            reset_request_languages(token)
        self.assertEqual([r[0].payload for r in kept], [{}, {"tone": "comedic"}, {"monologue_id": self.tr_m.id}])
        # English: the feed as it always was.
        self.assertEqual(_in_request_language(self.db, rows), rows)


if __name__ == "__main__":
    unittest.main()
