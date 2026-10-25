import base64
import math
import struct
import unittest
from unittest import mock

from app.services.rehearsal import synth
from app.services.rehearsal.delivery import LineVoice

OUT = LineVoice(text="Out.")


def _pcm(samples):
    return struct.pack(f"<{len(samples)}h", *samples)


def _tone(seconds, rate=synth.GEMINI_RATE, amp=8000):
    """A 220 Hz tone with no sample quiet enough to count as silence, so its
    first and last samples are exactly where the voice starts and ends."""
    out = []
    for i in range(int(seconds * rate)):
        s = int(amp * math.sin(2 * math.pi * 220 * i / rate))
        out.append(s if abs(s) >= 1000 else (1000 if s >= 0 else -1000))
    return out


class Openai(unittest.TestCase):
    def test_openai_is_told_the_delivery_note(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"mp3"
            out = synth.synthesize("openai", "coral", LineVoice(text="Out.", delivery="not looking at him"))
        self.assertEqual(out, b"mp3")
        tts.return_value.synthesize_speech.assert_called_once_with(
            "Out.", voice="coral", instructions="Deliver this line not looking at him.", response_format="mp3")

    def test_openai_neutral_without_a_note(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"x"
            synth.synthesize("openai", "coral", OUT)
        self.assertEqual(tts.return_value.synthesize_speech.call_args.kwargs["instructions"], "")

    def test_elevenlabs_prefixes_a_tag(self):
        # The key is patched so the test is hermetic: without it synthesize()
        # refuses before it ever reaches httpx.
        with mock.patch.object(synth.settings, "elevenlabs_api_key", "test-key"), \
             mock.patch.object(synth.httpx, "post") as post:
            post.return_value.status_code = 200
            post.return_value.content = b"mp3"
            synth.synthesize("elevenlabs", "vid", LineVoice(text="Out.", delivery="whispering"))
        self.assertEqual(post.call_args.kwargs["json"]["text"], "[whispering] Out.")

    def test_unknown_vendor(self):
        with self.assertRaises(ValueError):
            synth.synthesize("nope", "v", OUT)


class Gemini(unittest.TestCase):
    LINE = LineVoice(text="It's a joke. Laugh.", character="MARK", persona="playful, needy",
                     acting="teasing and affectionate", delivery="continuing his act")

    def _reply(self, pcm, mime="audio/l16; rate=24000; channels=1", rate=24000):
        res = mock.Mock(status_code=200)
        res.json.return_value = {"steps": [
            {"type": "user_input", "content": []},
            {"type": "model_output", "content": [
                {"type": "audio", "mime_type": mime, "sample_rate": rate, "channels": 1,
                 "data": base64.b64encode(pcm).decode()}]},
        ]}
        return res

    def test_sends_the_line_verbatim_with_the_direction_as_style_and_returns_mp3(self):
        pcm = _pcm([0] * 12000 + _tone(0.5) + [0] * 12000)
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.settings, "partner_tts_model", "gemini-3.8-flash-tts"), \
             mock.patch.object(synth.httpx, "post", return_value=self._reply(pcm)) as post:
            mp3 = synth.synthesize("gemini", "Puck", self.LINE)
        self.assertEqual(post.call_args.args[0], "https://generativelanguage.googleapis.com/v1beta/interactions")
        self.assertEqual(post.call_args.kwargs["headers"], {"x-goog-api-key": "g"})
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["model"], "gemini-3.8-flash-tts")
        self.assertEqual(body["generation_config"], {"speech_config": [{"voice": "Puck"}]})
        self.assertEqual(body["response_format"], {"type": "audio", "mime_type": "audio/l16"})
        content = body["input"][0]["content"][0]
        # The words and nothing else: 3.8 speaks whatever is in "text".
        self.assertEqual(content["text"], "It's a joke. Laugh.")
        self.assertEqual(content["annotations"], [{"type": "speech_metadata",
                                                   "style": "teasing and affectionate, continuing his act"}])
        # An MP3 (frame sync or an ID3 header), far smaller than the PCM.
        self.assertTrue(mp3[:3] == b"ID3" or (mp3[0] == 0xFF and mp3[1] & 0xE0 == 0xE0))
        self.assertLess(len(mp3), len(pcm) / 4)

    def test_a_rate_limit_is_tried_once_more(self):
        limited = mock.Mock(status_code=429, text="slow down")
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.time, "sleep") as sleep, \
             mock.patch.object(synth.httpx, "post", side_effect=[limited, self._reply(_pcm(_tone(0.2)))]) as post:
            synth.synthesize("gemini", "Kore", LineVoice(text="No."))
        self.assertEqual(post.call_count, 2)
        sleep.assert_called_once()

    def test_a_line_with_no_notes_has_no_style(self):
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.httpx, "post", return_value=self._reply(_pcm(_tone(0.2)))) as post:
            synth.synthesize("gemini", "Kore", LineVoice(text="No."))
        self.assertNotIn("annotations", post.call_args.kwargs["json"]["input"][0]["content"][0])

    def test_an_error_or_silence_is_a_failure(self):
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.time, "sleep"), \
             mock.patch.object(synth.httpx, "post", return_value=mock.Mock(status_code=429, text="quota")):
            with self.assertRaisesRegex(RuntimeError, "Gemini 429"):
                synth.synthesize("gemini", "Puck", self.LINE)
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.httpx, "post", return_value=self._reply(_pcm([0] * 24000))):
            with self.assertRaisesRegex(RuntimeError, "silence"):
                synth.synthesize("gemini", "Puck", self.LINE)
        empty = mock.Mock(status_code=200, text="{}"); empty.json.return_value = {"steps": []}
        with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
             mock.patch.object(synth.httpx, "post", return_value=empty):
            with self.assertRaisesRegex(RuntimeError, "no audio"):
                synth.synthesize("gemini", "Puck", self.LINE)

    def test_a_wav_or_another_rate_is_refused(self):
        for mime, rate in (("audio/wav", 24000), ("audio/l16; rate=16000", 16000)):
            with mock.patch.object(synth.settings, "gemini_api_key", "g"), \
                 mock.patch.object(synth.httpx, "post", return_value=self._reply(_pcm(_tone(0.1)), mime=mime, rate=rate)):
                with self.assertRaisesRegex(RuntimeError, "expected L16"):
                    synth.synthesize("gemini", "Puck", self.LINE)

    def test_no_key_refuses_before_the_network(self):
        with mock.patch.object(synth.settings, "gemini_api_key", None), \
             mock.patch.object(synth.httpx, "post") as post:
            with self.assertRaises(ValueError):
                synth.synthesize("gemini", "Puck", self.LINE)
        post.assert_not_called()


class Inworld(unittest.TestCase):
    def test_reads_with_the_voices_stand_in_and_a_tag(self):
        res = mock.Mock(status_code=200)
        res.json.return_value = {"audioContent": base64.b64encode(b"ID3mp3").decode()}
        line = LineVoice(text="Out.", acting="cold", delivery="aside", note="meaner")
        with mock.patch.object(synth.settings, "inworld_api_key", "abc"), \
             mock.patch.object(synth.httpx, "post", return_value=res) as post:
            out = synth.synthesize("inworld", "Puck", line)
        self.assertEqual(out, b"ID3mp3")
        self.assertEqual(post.call_args.args[0], "https://api.inworld.ai/tts/v1/voice")
        self.assertEqual(post.call_args.kwargs["headers"], {"Authorization": "Basic abc"})
        self.assertEqual(post.call_args.kwargs["json"], {
            "text": "[cold, aside; meaner] Out.", "voiceId": "James", "modelId": "inworld-tts-2",
            "audioConfig": {"audioEncoding": "MP3"},
        })


class Audio(unittest.TestCase):
    def test_trim_keeps_the_voice_and_a_short_pad(self):
        rate = synth.GEMINI_RATE
        voice = _tone(0.5)
        pcm = _pcm([0] * rate + voice + [3, -5] * (rate // 2))  # a second of silence before, low dither after
        out = synth.trim_silence(pcm)
        pad = int(rate * synth.EDGE_PAD_SECONDS)
        self.assertEqual(len(out) // 2, len(voice) + 2 * pad)
        samples = struct.unpack(f"<{len(out) // 2}h", out)
        self.assertEqual(list(samples[pad:pad + len(voice)]), voice)

    def test_trim_of_silence_is_empty_and_of_a_loud_line_is_untouched(self):
        self.assertEqual(synth.trim_silence(_pcm([0, 1, -2, 150] * 1000)), b"")
        self.assertEqual(synth.trim_silence(b""), b"")
        loud = _pcm(_tone(0.2))
        self.assertEqual(synth.trim_silence(loud), loud)

    def test_pcm_to_mp3_is_mono_mp3_about_a_sixth_of_the_size(self):
        pcm = _pcm(_tone(2.0))
        mp3 = synth.pcm_to_mp3(pcm)
        self.assertTrue(mp3[0] == 0xFF and mp3[1] & 0xE0 == 0xE0, mp3[:4])
        # 64 kbit/s against 384 kbit/s of PCM.
        self.assertLess(len(mp3), len(pcm) / 5)
        self.assertGreater(len(mp3), 64000 / 8 * 1.5)

    def test_model_for_each_vendor(self):
        with mock.patch.object(synth.settings, "partner_tts_model", "gemini-x"):
            self.assertEqual(synth.model_for("gemini"), "gemini-x")
        self.assertEqual(synth.model_for("inworld"), "inworld-tts-2")
