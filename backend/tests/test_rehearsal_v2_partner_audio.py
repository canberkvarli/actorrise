"""Keyed by what is said, synthesised once, claimed so two openers do not race."""
import unittest
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
        # Regenerate deletes the row; that is the only way a failed line is retried.
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        row = self.db.get(PartnerAudio, key); row.status = "failed"; row.error = "boom"; self.db.commit()
        self.assertFalse(pa._claim(self.db, key))
        self.assertEqual(self.db.get(PartnerAudio, key).status, "failed")

    def test_failure_is_recorded_and_row_released(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        with mock.patch.object(pa, "synthesize", side_effect=RuntimeError("boom")):
            pa.synthesise_pending(self.db, [key], text_for={key: ("Out.", None)})
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "failed"); self.assertIn("boom", row.error)
