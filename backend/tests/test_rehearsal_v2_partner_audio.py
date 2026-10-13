"""Keyed by what is said, synthesised once, claimed so two openers do not race."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from app.models.rehearsal import PartnerAudio
from app.services.rehearsal import partner_audio as pa
from tests.dbfixture import memory_db, restore


class Key(unittest.TestCase):
    def test_key_ignores_whitespace_and_case_of_nothing_else(self):
        a = pa.audio_key("openai", "coral", None, "Out.  ")
        b = pa.audio_key("openai", "coral", None, "Out.")
        c = pa.audio_key("openai", "coral", "(quiet)", "Out.")
        self.assertEqual(a, b); self.assertNotEqual(a, c); self.assertEqual(len(a), 64)


class Cache(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db((PartnerAudio,))

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def test_ensure_creates_pending_once(self):
        k1 = pa.ensure(self.db, "openai", "coral", None, "Out.")
        k2 = pa.ensure(self.db, "openai", "coral", None, "Out.")
        self.assertEqual(k1, k2)
        self.assertEqual(self.db.query(PartnerAudio).count(), 1)

    def test_worker_synthesises_uploads_and_marks_ready(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        with mock.patch.object(pa, "synthesize", return_value=b"mp3") as syn, \
             mock.patch.object(pa, "_upload") as up:
            pa.synthesise_pending(self.db, [key], text_for={key: ("Out.", None)})
        syn.assert_called_once_with("openai", "coral", "Out.", None)
        up.assert_called_once()
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "ready")
        self.assertEqual(row.storage_path, f"{key[:2]}/{key}.mp3")

    def test_claimed_row_is_skipped_by_a_second_worker(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        self.assertTrue(pa._claim(self.db, key))
        self.assertFalse(pa._claim(self.db, key))

    def test_failed_row_is_not_claimed(self):
        # A fresh failure is left alone, so every scene open does not hammer a
        # vendor that just said no. After an hour it is tried once more.
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        row = self.db.get(PartnerAudio, key)
        row.status = "failed"; row.error = "boom"; row.claimed_at = datetime.now(timezone.utc); self.db.commit()
        self.assertFalse(pa._claim(self.db, key))
        self.assertEqual(self.db.get(PartnerAudio, key).status, "failed")

        row.claimed_at = datetime.now(timezone.utc) - timedelta(hours=2); self.db.commit()
        self.assertTrue(pa._claim(self.db, key))
        again = self.db.get(PartnerAudio, key)
        self.assertEqual((again.status, again.error), ("pending", None))

    def test_retryable_is_an_hour_after_the_failure(self):
        now = datetime.now(timezone.utc)
        self.assertEqual(pa.FAILED_RETRY, timedelta(hours=1))
        failed = lambda **kw: PartnerAudio(key="k", vendor="openai", voice="coral", status="failed", **kw)  # noqa: E731
        self.assertFalse(pa.retryable(failed(claimed_at=now), now))
        self.assertFalse(pa.retryable(failed(claimed_at=now - timedelta(minutes=59)), now))
        self.assertTrue(pa.retryable(failed(claimed_at=now - timedelta(hours=1)), now))
        self.assertTrue(pa.retryable(failed(claimed_at=now - timedelta(hours=2)), now))
        # A failure recorded before the retry rule has no claim time; it is old.
        self.assertTrue(pa.retryable(failed(claimed_at=None), now))
        # Only failed rows are ever retried this way.
        self.assertFalse(pa.retryable(PartnerAudio(key="k", vendor="openai", voice="coral", status="ready"), now))
        self.assertFalse(pa.retryable(PartnerAudio(key="k", vendor="openai", voice="coral", status="pending"), now))

    def test_failure_is_recorded_and_row_released(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        with mock.patch.object(pa, "synthesize", side_effect=RuntimeError("boom")):
            pa.synthesise_pending(self.db, [key], text_for={key: ("Out.", None)})
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
