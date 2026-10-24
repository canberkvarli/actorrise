"""Keyed by what is said, synthesised once, claimed so two openers do not race."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.rehearsal import PartnerAudio
from app.services.rehearsal import partner_audio as pa
from app.services.rehearsal.delivery import LineVoice
from tests.dbfixture import memory_db, restore

OUT = LineVoice(text="Out.")


class Key(unittest.TestCase):
    def test_key_ignores_whitespace_and_case_of_nothing_else(self):
        a = pa.audio_key("openai", "coral", LineVoice(text="Out.  "))
        b = pa.audio_key("openai", "coral", OUT)
        c = pa.audio_key("openai", "coral", LineVoice(text="Out.", delivery="quiet"))
        self.assertEqual(a, b); self.assertNotEqual(a, c); self.assertEqual(len(a), 64)


class Cache(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db((PartnerAudio,))

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def test_ensure_creates_pending_once(self):
        k1 = pa.ensure(self.db, "openai", "coral", OUT)
        k2 = pa.ensure(self.db, "openai", "coral", OUT)
        self.assertEqual(k1, k2)
        self.assertEqual(self.db.query(PartnerAudio).count(), 1)

    def test_worker_synthesises_uploads_and_marks_ready(self):
        key = pa.ensure(self.db, "openai", "coral", OUT)
        with mock.patch.object(pa, "synthesize", return_value=b"mp3") as syn, \
             mock.patch.object(pa, "_upload") as up:
            pa.synthesise_pending(self.db, [key], line_for={key: OUT})
        syn.assert_called_once_with("openai", "coral", OUT)
        up.assert_called_once()
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "ready")
        self.assertEqual(row.storage_path, f"{key[:2]}/{key}.mp3")

    def test_claimed_row_is_skipped_by_a_second_worker(self):
        key = pa.ensure(self.db, "openai", "coral", OUT)
        self.assertTrue(pa._claim(self.db, key))
        self.assertFalse(pa._claim(self.db, key))

    def test_failed_row_is_not_claimed(self):
        # A fresh failure is left alone, so every scene open does not hammer a
        # vendor that just said no. After five minutes it is tried once more.
        key = pa.ensure(self.db, "openai", "coral", OUT)
        row = self.db.get(PartnerAudio, key)
        row.status = "failed"; row.error = "boom"; row.claimed_at = datetime.now(timezone.utc); self.db.commit()
        self.assertFalse(pa._claim(self.db, key))
        self.assertEqual(self.db.get(PartnerAudio, key).status, "failed")

        row.claimed_at = datetime.now(timezone.utc) - timedelta(hours=2); self.db.commit()
        self.assertTrue(pa._claim(self.db, key))
        again = self.db.get(PartnerAudio, key)
        self.assertEqual((again.status, again.error), ("pending", None))

    def test_retryable_is_five_minutes_after_the_failure(self):
        now = datetime.now(timezone.utc)
        self.assertEqual(pa.FAILED_RETRY, timedelta(minutes=5))
        failed = lambda **kw: PartnerAudio(key="k", vendor="openai", voice="coral", status="failed", **kw)  # noqa: E731
        self.assertFalse(pa.retryable(failed(claimed_at=now), now))
        self.assertFalse(pa.retryable(failed(claimed_at=now - timedelta(minutes=1)), now))
        self.assertFalse(pa.retryable(failed(claimed_at=now - timedelta(minutes=4)), now))
        self.assertTrue(pa.retryable(failed(claimed_at=now - timedelta(minutes=5)), now))
        self.assertTrue(pa.retryable(failed(claimed_at=now - timedelta(minutes=10)), now))
        self.assertTrue(pa.retryable(failed(claimed_at=now - timedelta(hours=2)), now))
        # A failure recorded before the retry rule has no claim time; it is old.
        self.assertTrue(pa.retryable(failed(claimed_at=None), now))
        # Only failed rows are ever retried this way.
        self.assertFalse(pa.retryable(PartnerAudio(key="k", vendor="openai", voice="coral", status="ready"), now))
        self.assertFalse(pa.retryable(PartnerAudio(key="k", vendor="openai", voice="coral", status="pending"), now))

    def test_failure_is_recorded_and_row_released(self):
        key = pa.ensure(self.db, "openai", "coral", OUT)
        with mock.patch.object(pa, "synthesize", side_effect=RuntimeError("boom")):
            pa.synthesise_pending(self.db, [key], line_for={key: OUT})
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "failed"); self.assertIn("boom", row.error)
        # The claim time stays: it is when the failure happened, and the retry
        # clock runs from it.
        self.assertIsNotNone(row.claimed_at)
        self.assertFalse(pa._claim(self.db, key))


class Signing(unittest.TestCase):
    def _client(self, items):
        bucket = mock.Mock()
        bucket.create_signed_urls.return_value = items
        client = mock.Mock()
        client.storage.from_.return_value = bucket
        return client, bucket

    def test_signed_urls_is_one_call_keyed_by_path(self):
        client, bucket = self._client([
            {"path": "ab/x.mp3", "error": None, "signedURL": "https://s/ab/x", "signedUrl": "https://s/ab/x"},
            {"path": "cd/y.mp3", "error": "not found", "signedURL": "", "signedUrl": ""},
        ])
        with mock.patch.object(pa, "get_supabase_client", return_value=client):
            out = pa.signed_urls(["ab/x.mp3", "cd/y.mp3"])
        self.assertEqual(out, {"ab/x.mp3": "https://s/ab/x", "cd/y.mp3": None})
        bucket.create_signed_urls.assert_called_once_with(["ab/x.mp3", "cd/y.mp3"], pa.SIGNED_URL_SECONDS)

    def test_signed_urls_with_nothing_to_sign_never_calls_storage(self):
        client, bucket = self._client([])
        with mock.patch.object(pa, "get_supabase_client", return_value=client):
            self.assertEqual(pa.signed_urls([]), {})
        bucket.create_signed_urls.assert_not_called()

    def test_signed_urls_without_storage_is_all_none(self):
        with mock.patch.object(pa, "get_supabase_client", return_value=None):
            self.assertEqual(pa.signed_urls(["ab/x.mp3"]), {"ab/x.mp3": None})


class GeminiKey(unittest.TestCase):
    """Every input to the audio is in the key, so changing any of them is a
    new line, voiced the next time it plays, and nothing else."""

    BASE = LineVoice(text="Out.", character="MARK", persona="You are Mark.", acting="teasing", delivery="aside", note="")

    def test_each_part_of_the_prompt_changes_the_key(self):
        from dataclasses import replace
        base = pa.audio_key("gemini", "Puck", self.BASE)
        for change in (dict(persona="You are Mark, a man in his 40s."), dict(acting="cold"),
                       dict(delivery="shouting"), dict(note="meaner"), dict(text="In.")):
            self.assertNotEqual(pa.audio_key("gemini", "Puck", replace(self.BASE, **change)), base, change)
        self.assertNotEqual(pa.audio_key("gemini", "Kore", self.BASE), base)
        self.assertNotEqual(pa.audio_key("inworld", "Puck", self.BASE), base)

    def test_the_model_is_in_the_key(self):
        a = pa.audio_key("gemini", "Puck", self.BASE)
        with mock.patch.object(pa.settings, "partner_tts_model", "gemini-9-tts"):
            self.assertNotEqual(pa.audio_key("gemini", "Puck", self.BASE), a)

    def test_old_openai_audio_is_not_a_gemini_key(self):
        # Old OpenAI rows are left where they are; the same line under Gemini
        # is a different key, so it is voiced again when next played.
        self.assertNotEqual(pa.audio_key("openai", "coral", self.BASE), pa.audio_key("gemini", "coral", self.BASE))

    def test_openai_keeps_its_old_key_shape(self):
        import hashlib
        legacy = hashlib.sha256("openai|coral|aside|Out.".encode()).hexdigest()
        self.assertEqual(pa.audio_key("openai", "coral", self.BASE), legacy)


class Cap(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db((PartnerAudio,))
        self.patches = [
            mock.patch.object(pa.settings, "partner_tts_vendor", "gemini"),
            mock.patch.object(pa.settings, "partner_tts_monthly_chars", 100),
            mock.patch.object(pa.settings, "inworld_api_key", "iw"),
            mock.patch.object(pa, "_mail_cap_once"),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); restore(self._saved)

    def _row(self, key, chars, vendor="gemini", status="ready", created=None):
        self.db.add(PartnerAudio(key=key, vendor=vendor, voice="Puck", status=status, chars=chars,
                                 created_at=created or datetime.now(timezone.utc)))
        self.db.commit()

    def test_chars_this_month_counts_only_this_months_ready_gemini_rows(self):
        now = datetime.now(timezone.utc)
        self._row("a", 40)
        self._row("b", 30)
        self._row("c", 500, status="failed")
        self._row("d", 500, status="pending")
        self._row("e", 500, vendor="inworld")
        self._row("f", 500, created=now.replace(day=1) - timedelta(days=2))
        self._row("g", None)  # an old row, before the column
        self.assertEqual(pa.chars_this_month(self.db, now), 70)

    def test_under_the_cap_is_gemini(self):
        self._row("a", 99)
        self.assertFalse(pa.over_cap(self.db))
        self.assertEqual(pa.vendor_for(self.db, "Puck", OUT, capped=False), "gemini")
        pa._mail_cap_once.assert_not_called()

    def test_at_the_cap_new_lines_go_to_inworld_and_the_founder_hears_once(self):
        self._row("a", 100)
        self.assertTrue(pa.over_cap(self.db))
        pa._mail_cap_once.assert_called_once()
        key = pa.ensure_for(self.db, "Puck", OUT, capped=True)
        self.assertEqual(self.db.get(PartnerAudio, key).vendor, "inworld")
        self.assertEqual(key, pa.audio_key("inworld", "Puck", OUT))

    def test_saved_audio_is_never_regenerated_because_of_the_cap(self):
        saved = pa.ensure(self.db, "gemini", "Puck", OUT)
        row = self.db.get(PartnerAudio, saved); row.status = "ready"; row.storage_path = "ab/x.mp3"; self.db.commit()
        self.assertEqual(pa.ensure_for(self.db, "Puck", OUT, capped=True), saved)
        self.assertEqual(self.db.query(PartnerAudio).count(), 1)

    def test_with_no_inworld_key_gemini_carries_on(self):
        with mock.patch.object(pa.settings, "inworld_api_key", None):
            self.assertEqual(pa.vendor_for(self.db, "Puck", OUT, capped=True), "gemini")

    def test_another_vendor_has_no_cap(self):
        self._row("a", 1000)
        with mock.patch.object(pa.settings, "partner_tts_vendor", "openai"):
            self.assertFalse(pa.over_cap(self.db))

    def test_ensure_records_the_line_length(self):
        key = pa.ensure(self.db, "gemini", "Puck", LineVoice(text="Where were you?"))
        self.assertEqual(self.db.get(PartnerAudio, key).chars, 15)


class CapMail(unittest.TestCase):
    def test_the_mail_goes_once_a_month(self):
        claimed = set()

        def claim(db, key, month):
            if (key, month) in claimed:
                return False
            claimed.add((key, month)); return True

        now = datetime(2026, 10, 23, tzinfo=timezone.utc)
        with mock.patch("app.services.app_settings.claim_day", side_effect=claim), \
             mock.patch("app.services.email.notifications.send_partner_tts_cap_notification") as send:
            pa._mail_cap_once(None, now, 300001)
            pa._mail_cap_once(None, now, 300500)
            pa._mail_cap_once(None, datetime(2026, 11, 2, tzinfo=timezone.utc), 300001)
        self.assertEqual(send.call_count, 2)
        self.assertEqual(send.call_args_list[0].kwargs["month"], "2026-10")

    def test_a_failed_mail_never_stops_a_line(self):
        with mock.patch("app.services.app_settings.claim_day", side_effect=RuntimeError("db")):
            pa._mail_cap_once(None, datetime.now(timezone.utc), 1)  # does not raise


class DailyLimit(unittest.TestCase):
    """Gemini's 100 a day: a scene goes to OpenAI whole, never half."""

    def setUp(self):
        self.db, self._saved = memory_db((PartnerAudio,))
        self.patches = [
            mock.patch.object(pa.settings, "partner_tts_vendor", "gemini"),
            mock.patch.object(pa.settings, "openai_api_key", "sk"),
            mock.patch.object(pa.settings, "inworld_api_key", None),
            mock.patch.object(pa, "GEMINI_RPD", 5),
        ]
        for p in self.patches: p.start()
        self.part = [("Puck", LineVoice(text=f"Line {i}.")) for i in range(3)]

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); restore(self._saved)

    def _spend(self, n):
        for i in range(n):
            pa.ensure(self.db, "gemini", "Kore", LineVoice(text=f"Spent {i}."))
        self.db.commit()

    def test_a_day_with_room_is_gemini(self):
        self._spend(2)
        self.assertEqual(pa.scene_vendor(self.db, self.part, capped=False), "gemini")

    def test_a_day_without_room_for_the_whole_part_is_openai(self):
        self._spend(3)
        self.assertEqual(pa.scene_vendor(self.db, self.part, capped=False), "openai")

    def test_a_part_saved_in_gemini_stays_gemini_when_the_day_is_spent(self):
        self._spend(5)
        for voice, line in self.part:
            row = self.db.get(PartnerAudio, pa.ensure(self.db, "gemini", voice, line))
            row.status = "ready"
        self.db.commit()
        self.assertEqual(pa.scene_vendor(self.db, self.part, capped=False), "gemini")

    def test_a_refusal_for_the_day_sends_the_rest_of_the_day_to_openai(self):
        key = pa.ensure(self.db, "gemini", "Kore", LineVoice(text="No."))
        row = self.db.get(PartnerAudio, key)
        row.status, row.claimed_at, row.error = "failed", datetime.now(timezone.utc), "Gemini 429: 100 requests per day"
        self.db.commit()
        self.assertTrue(pa.gemini_out_today(self.db))
        self.assertEqual(pa.scene_vendor(self.db, self.part, capped=False), "openai")

    def test_yesterdays_refusal_does_not_count_today(self):
        key = pa.ensure(self.db, "gemini", "Kore", LineVoice(text="No."))
        row = self.db.get(PartnerAudio, key)
        row.status, row.error = "failed", "per day"
        row.claimed_at = row.created_at = datetime.now(timezone.utc) - timedelta(days=2)
        self.db.commit()
        self.assertFalse(pa.gemini_out_today(self.db))
        self.assertEqual(pa.gemini_left_today(self.db), 5)

    def test_openai_reads_in_the_stand_in_voice(self):
        voice, line = self.part[0]
        key = pa.ensure_as(self.db, "openai", voice, line)
        self.assertEqual(self.db.get(PartnerAudio, key).voice, "fable")
        self.assertEqual(key, pa.audio_key("openai", "fable", line))

    def test_without_an_openai_key_gemini_carries_on(self):
        self._spend(5)
        with mock.patch.object(pa.settings, "openai_api_key", None):
            self.assertEqual(pa.scene_vendor(self.db, self.part, capped=False), "gemini")

    def test_a_line_refused_for_the_day_is_read_by_openai_at_once(self):
        voice, line = self.part[0]
        key = pa.ensure(self.db, "gemini", voice, line)
        self.db.commit()

        def synth(vendor, _voice, _line):
            if vendor == "gemini":
                raise RuntimeError("Gemini 429: limit: 100 requests per day")
            return b"mp3"

        with mock.patch.object(pa, "synthesize", side_effect=synth), mock.patch.object(pa, "_upload"):
            pa.synthesise_pending(self.db, [key], {key: line})
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "failed")
        stand_in = pa.stand_in_key(row)
        self.assertEqual(stand_in, pa.audio_key("openai", "fable", line))
        self.assertEqual(self.db.get(PartnerAudio, stand_in).status, "ready")

    def test_an_ordinary_failure_has_no_stand_in(self):
        voice, line = self.part[0]
        key = pa.ensure(self.db, "gemini", voice, line)
        self.db.commit()
        with mock.patch.object(pa, "synthesize", side_effect=RuntimeError("Gemini 500")), \
             mock.patch.object(pa, "_upload"):
            pa.synthesise_pending(self.db, [key], {key: line})
        self.assertIsNone(pa.stand_in_key(self.db.get(PartnerAudio, key)))
        self.assertEqual(self.db.query(PartnerAudio).count(), 1)
