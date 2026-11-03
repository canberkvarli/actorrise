"""Turkish rehearsal: the language a scene is spoken in, and every place that
has to hear it (the transcriber, the live session, the script parser).

English must behave exactly as it always has; every test here pins both."""
import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import speech
from app.api.auth import get_current_user
from app.core.config import settings
from app.services.rehearsal.language import detect, normalise, scene_language
from app.services.script_parser import _cue_names, parse_dialogue
from app.services.script_structure import _match_act, _match_scene, detect_structure

TURKISH = (
    "Olmak ya da olmamak, işte bütün mesele bu. Hangisi daha soylu: zalim "
    "talihin taşlarına, oklarına katlanmak mı, yoksa bir dert denizine karşı "
    "silaha sarılıp o dertlere son vermek mi?"
)
ENGLISH = (
    "To be, or not to be, that is the question: whether 'tis nobler in the mind "
    "to suffer the slings and arrows of outrageous fortune, or to take arms "
    "against a sea of troubles. Herr Müller says Göring was here."
)


class Detect(unittest.TestCase):
    def test_turkish_prose_is_turkish(self):
        self.assertEqual(detect(TURKISH), "tr")
        self.assertEqual(detect("Şirin, kadın dediğin evde oturmaz; ışıkları kapat da çık. Ben de gelmiyorum, değil mi?"), "tr")

    def test_english_never_flips(self):
        self.assertEqual(detect(ENGLISH), "en")
        # A Turkish name in an English play is still an English play.
        self.assertEqual(detect("Şirin walks in. I don't know what you want from me, Şirin, I really don't. Go home."), "en")
        self.assertEqual(detect(""), "en")
        self.assertEqual(detect("Bu."), "en")  # too short to call

    def test_normalise(self):
        self.assertEqual(normalise("tr"), "tr")
        self.assertEqual(normalise("tr-TR"), "tr")
        self.assertEqual(normalise("TR"), "tr")
        self.assertEqual(normalise("en"), "en")
        self.assertEqual(normalise(None), "en")
        self.assertEqual(normalise("de"), "en")
        self.assertEqual(normalise("<script>"), "en")

    def test_scene_language(self):
        self.assertEqual(scene_language("tr", False, ["anything"]), "tr")
        self.assertEqual(scene_language("en", False, [TURKISH]), "en")  # a library play says what it is
        self.assertEqual(scene_language("en", True, [TURKISH]), "tr")   # an upload is read
        self.assertEqual(scene_language(None, True, [ENGLISH]), "en")


class TurkishCues(unittest.TestCase):
    def test_turkish_capitals_are_cues(self):
        text = (
            "ŞİRİN: Nereye gidiyorsun bu saatte?\n"
            "ÇAĞLA: Dışarı. Biraz hava almam lazım.\n"
            "ŞİRİN: Kadın dediğin evde oturur mu sanıyorsun?\n"
            "ÇAĞLA: Ben öyle sanmıyorum. Işıkları kapat.\n"
        )
        lines = [l for s in parse_dialogue(text) for l in s["lines"]]
        self.assertEqual([l["character"] for l in lines], ["ŞİRİN", "ÇAĞLA", "ŞİRİN", "ÇAĞLA"])
        self.assertEqual(lines[2]["text"], "Kadın dediğin evde oturur mu sanıyorsun?")

    def test_turkish_cues_on_their_own_line(self):
        text = "ŞİRİN\nNereye gidiyorsun?\n\nİSMAİL\nDışarı.\n\nŞİRİN\nGitme.\n\nİSMAİL\nGidiyorum.\n"
        self.assertEqual(set(_cue_names(text)), {"ŞİRİN", "İSMAİL"})
        lines = [l for s in parse_dialogue(text) for l in s["lines"]]
        self.assertEqual([l["character"] for l in lines], ["ŞİRİN", "İSMAİL", "ŞİRİN", "İSMAİL"])

    def test_english_cues_unchanged(self):
        text = "ANNA: Where were you?\nBEN: Out.\nANNA: Out where?\nBEN: Just out.\n"
        lines = [(l["character"], l["text"]) for s in parse_dialogue(text) for l in s["lines"]]
        self.assertEqual(lines, [("ANNA", "Where were you?"), ("BEN", "Out."), ("ANNA", "Out where?"), ("BEN", "Just out.")])


class TurkishHeadings(unittest.TestCase):
    def test_perde_is_an_act(self):
        for heading, act in [("PERDE I", "Act 1"), ("Perde 2", "Act 2"), ("I. PERDE", "Act 1"),
                             ("BİRİNCİ PERDE", "Act 1"), ("Birinci Perde", "Act 1"),
                             ("BIRINCI PERDE", "Act 1"), ("ÜÇÜNCÜ PERDE", "Act 3"), ("UCUNCU PERDE", "Act 3")]:
            self.assertEqual(_match_act(heading), act, heading)
            self.assertIsNone(_match_scene(heading), heading)

    def test_sahne_is_a_scene(self):
        for heading, scene in [("SAHNE 4", "Scene 4"), ("3. SAHNE", "Scene 3"),
                               ("İkinci Sahne", "Scene 2"), ("Dördüncü Sahne: Saray", "Scene 4")]:
            self.assertEqual(_match_scene(heading), scene, heading)

    def test_prose_is_not_a_heading(self):
        for line in ["Birinci perde açılırken herkes susar", "Sahne 2'de oyuncular yerini alır",
                     "perde iner", "sahne ışıkları söner", "Perde indi."]:
            self.assertIsNone(_match_act(line), line)
            self.assertIsNone(_match_scene(line), line)

    def test_english_headings_unchanged(self):
        self.assertEqual(_match_act("ACT III"), "Act 3")
        self.assertEqual(_match_scene("SCENE 2"), "Scene 2")
        self.assertIsNone(_match_scene("Scene is perhaps marred to most modern readers"))

    def test_a_turkish_play_splits_by_perde_and_sahne(self):
        speech = "ŞİRİN: Nereye gidiyorsun bu saatte?\nÇAĞLA: Dışarı. Biraz hava almam lazım.\n" * 4
        text = (
            "BİRİNCİ PERDE\n\nBirinci Sahne\n\n" + speech
            + "\nİkinci Sahne\n\n" + speech
            + "\nİKİNCİ PERDE\n\nBirinci Sahne\n\n" + speech
        )
        # The same shape an English play gets: each act heading is a chunk of
        # its own, then its scenes.
        labels = [(c.act_label, c.scene_label) for c in detect_structure(text)]
        self.assertEqual(labels, [("Act 1", None), ("Act 1", "Scene 1"), ("Act 1", "Scene 2"),
                                  ("Act 2", None), ("Act 2", "Scene 1")])


class SpeechLanguage(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(speech.router)
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
        for dep in speech.router.routes:
            for d in getattr(dep, "dependant", SimpleNamespace(dependencies=[])).dependencies:
                if d.call is not get_current_user and d.call is not None and d.name in ("_gate", "_burst"):
                    app.dependency_overrides[d.call] = lambda: True
        self.client = TestClient(app)
        self.openai = mock.MagicMock()
        self.openai.audio.transcriptions.create.return_value = SimpleNamespace(text="olmak ya da olmamak")
        self.openai.realtime.client_secrets.create.return_value = SimpleNamespace(value="ek_1", expires_at=1)
        self.patches = [
            mock.patch.object(speech, "OpenAI", return_value=self.openai),
            mock.patch.object(settings, "openai_api_key", "sk-test"),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()

    def _transcribe(self, query=""):
        r = self.client.post(f"/api/speech/transcribe{query}", files={"audio": ("a.webm", b"x" * 1000, "audio/webm")})
        self.assertEqual(r.status_code, 200, r.text)
        return self.openai.audio.transcriptions.create.call_args.kwargs["language"]

    def test_transcribe_is_english_by_default(self):
        self.assertEqual(self._transcribe(), "en")
        self.assertEqual(self._transcribe("?language=fr"), "en")

    def test_transcribe_hears_turkish(self):
        self.assertEqual(self._transcribe("?language=tr"), "tr")

    def _live(self, body):
        r = self.client.post("/api/speech/live-session", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        session = self.openai.realtime.client_secrets.create.call_args.kwargs["session"]
        return session["audio"]["input"]["transcription"]["languages"]

    def test_live_session_is_english_by_default(self):
        self.assertEqual(self._live({"prompt": "", "keywords": []}), ["en"])

    def test_live_session_hears_turkish(self):
        self.assertEqual(self._live({"prompt": "", "keywords": ["Hamlet"], "language": "tr"}), ["tr"])


if __name__ == "__main__":
    unittest.main()
