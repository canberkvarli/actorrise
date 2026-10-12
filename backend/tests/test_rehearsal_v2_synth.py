import unittest
from unittest import mock

from app.services.rehearsal import synth


class Synth(unittest.TestCase):
    def test_openai_passes_direction_as_instructions(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"mp3"
            out = synth.synthesize("openai", "coral", "Out.", "(not looking at him)")
        self.assertEqual(out, b"mp3")
        tts.return_value.synthesize_speech.assert_called_once_with(
            "Out.", voice="coral", instructions="Deliver this line not looking at him.", response_format="mp3")

    def test_openai_neutral_without_direction(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"x"
            synth.synthesize("openai", "coral", "Out.", None)
        self.assertEqual(tts.return_value.synthesize_speech.call_args.kwargs["instructions"], "")

    def test_elevenlabs_prefixes_direction_tag(self):
        # The key is patched so the test is hermetic: without it synthesize()
        # refuses before it ever reaches httpx.
        with mock.patch.object(synth.settings, "elevenlabs_api_key", "test-key"), \
             mock.patch.object(synth.httpx, "post") as post:
            post.return_value.status_code = 200
            post.return_value.content = b"mp3"
            synth.synthesize("elevenlabs", "vid", "Out.", "(whispering)")
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["text"], "[whispering] Out.")

    def test_unknown_vendor(self):
        with self.assertRaises(ValueError):
            synth.synthesize("nope", "v", "t", None)
