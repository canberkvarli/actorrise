"""Gemini's per-minute limit: calls queue for a slot, a 429 waits as told."""
from unittest import mock

from app.services.rehearsal import synth


def test_retry_after_reads_the_wait_gemini_asks_for():
    assert synth._retry_after("Please retry in 48s or upgrade") == 49.0
    assert synth._retry_after("Please retry in 2.5s") == 3.5
    assert synth._retry_after("no hint here") == 20.0
    assert synth._retry_after("Please retry in 600s") == 65.0


def test_the_eleventh_call_in_a_minute_waits_for_a_slot():
    clock = [1000.0]
    sleeps = []

    def sleep(s):
        sleeps.append(s)
        clock[0] += s

    synth._slots.clear()
    with mock.patch.object(synth, "GEMINI_RPM", 10), \
         mock.patch.object(synth.time, "monotonic", lambda: clock[0]), \
         mock.patch.object(synth.time, "sleep", sleep):
        for _ in range(10):
            synth._wait_for_gemini_slot()
        assert sleeps == []
        synth._wait_for_gemini_slot()
    assert len(sleeps) == 1 and 59 < sleeps[0] <= 60.1
    synth._slots.clear()


def test_a_429_is_waited_out_and_tried_again():
    class Res:
        def __init__(self, code, text=""):
            self.status_code, self.text = code, text

        def json(self):
            return {"steps": [{"type": "model_output", "content": [
                {"type": "audio", "data": "AAAA", "sample_rate": 24000, "mime_type": "audio/l16"}]}]}

    replies = [Res(429, "Please retry in 3s"), Res(200)]
    line = mock.Mock(text="Stop it.")
    synth._slots.clear()
    with mock.patch.object(synth.settings, "gemini_api_key", "k"), \
         mock.patch.object(synth, "gemini_style", lambda _l: ""), \
         mock.patch.object(synth.httpx, "post", side_effect=lambda *a, **k: replies.pop(0)), \
         mock.patch.object(synth.time, "sleep") as slept:
        assert synth._gemini_pcm("Aoede", line) == b"\x00\x00\x00"
    slept.assert_any_call(4.0)
    synth._slots.clear()


def test_a_daily_limit_is_not_waited_out():
    class Res:
        status_code = 429
        text = "limit: 100 requests per day on Tier 1). Please retry in 16h2m1s"

    calls = []
    line = mock.Mock(text="Stop it.")
    with mock.patch.object(synth.settings, "gemini_api_key", "k"), \
         mock.patch.object(synth, "gemini_style", lambda _l: ""), \
         mock.patch.object(synth.httpx, "post", side_effect=lambda *a, **k: calls.append(1) or Res()):
        try:
            synth._gemini_pcm("Aoede", line)
        except RuntimeError as e:
            assert "429" in str(e)
    assert len(calls) == 1
