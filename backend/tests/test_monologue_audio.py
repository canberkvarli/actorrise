"""The read-aloud for "Hear it" (2026-10-21).

The browser sends the lines it split the piece into, and the server turns each
into cached speech. The check that matters is the one that keeps the route from
being a free text-to-speech service: only the piece's own words get spoken.
"""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.services import monologue_audio
from app.services.events import CLIENT_EVENT_NAMES


PIECE = "I came here to say something. [She turns.] And I will say it, whether you like it or not!"


class TheLinesMustBeThePiece(unittest.TestCase):
    def setUp(self):
        self.source = monologue_audio.source_text(PIECE, None)

    def test_the_brackets_go_like_they_do_in_the_browser(self):
        self.assertNotIn("She turns", self.source)
        self.assertIn("something. And I will", self.source)

    def test_its_own_sentences_belong(self):
        self.assertTrue(
            monologue_audio.lines_belong(
                ["I came here to say something.", "And I will say it, whether you like it or not!"],
                self.source,
            )
        )

    def test_extra_whitespace_in_a_line_still_belongs(self):
        self.assertTrue(monologue_audio.lines_belong(["I came  here\nto say something."], self.source))

    def test_anything_else_is_refused(self):
        self.assertFalse(monologue_audio.lines_belong(["Buy my product now."], self.source))

    def test_one_stranger_refuses_the_lot(self):
        self.assertFalse(
            monologue_audio.lines_belong(["I came here to say something.", "Hello there."], self.source)
        )

    def test_empty_requests_are_refused(self):
        self.assertFalse(monologue_audio.lines_belong([], self.source))
        self.assertFalse(monologue_audio.lines_belong(["   "], self.source))

    def test_too_many_lines_are_refused(self):
        self.assertFalse(
            monologue_audio.lines_belong(["I came here"] * (monologue_audio.MAX_LINES + 1), self.source)
        )

    def test_dialogue_segments_win_over_the_raw_text(self):
        segments = [
            {"type": "direction", "text": "He sits."},
            {"type": "dialogue", "text": "First words."},
            {"type": "dialogue", "text": "Second words."},
        ]
        source = monologue_audio.source_text("He sits. First words. Second words.", segments)
        self.assertEqual(source, "First words. Second words.")
        self.assertFalse(monologue_audio.lines_belong(["He sits."], source))


class TheVoiceFollowsTheCharacter(unittest.TestCase):
    def test_a_mans_piece(self):
        self.assertEqual(monologue_audio.voice_for("male").gender, "male")

    def test_a_womans_piece(self):
        self.assertEqual(monologue_audio.voice_for("female").gender, "female")

    def test_unknown_or_any(self):
        self.assertEqual(monologue_audio.voice_for(None).gender, "female")
        self.assertEqual(monologue_audio.voice_for("any").gender, "female")


class TheRoute(unittest.TestCase):
    def _call(self, lines, *, row_status="pending"):
        from app.api.monologue_work import AudioRequest, audio_for_lines

        mono = MagicMock(text=PIECE, text_segments=None, character_gender="female")
        row = MagicMock(status=row_status, storage_path="ab/x.mp3" if row_status == "ready" else None, claimed_at=None)
        db = MagicMock()
        db.get.side_effect = lambda model, key: mono if key == 5 else row
        background = MagicMock()
        with patch("app.api.monologue_work.partner_audio.ensure", side_effect=lambda db, v, voice, d, t: f"k:{t}"), \
             patch("app.api.monologue_work.partner_audio.signed_urls", side_effect=lambda paths: {p: "https://signed" for p in paths}):
            out = audio_for_lines(
                req=AudioRequest(monologue_id=5, lines=lines),
                background=background,
                db=db,
                current_user=MagicMock(id=1),
            )
        return out, background

    def test_a_cold_piece_queues_synthesis_and_answers_without_urls(self):
        out, background = self._call(["I came here to say something."])
        self.assertEqual(len(out["lines"]), 1)
        self.assertIsNone(out["lines"][0]["url"])
        background.add_task.assert_called_once()

    def test_a_warm_piece_answers_with_urls_and_queues_nothing(self):
        out, background = self._call(["I came here to say something."], row_status="ready")
        self.assertEqual(out["lines"][0]["url"], "https://signed")
        background.add_task.assert_not_called()

    def test_foreign_text_is_a_422(self):
        with self.assertRaises(HTTPException) as ctx:
            self._call(["Read my shopping list."])
        self.assertEqual(ctx.exception.status_code, 422)


class TheRouteIsRateLimited(unittest.TestCase):
    """Every cold piece is a paid synthesis; one account must not walk the library."""

    def test_both_windows_are_configured(self):
        from app.middleware.burst_limiter import BURST_LIMITS

        self.assertIn("monologue_audio", BURST_LIMITS)
        self.assertEqual(BURST_LIMITS["monologue_audio_hour"]["window_seconds"], 3600)

    def test_the_route_depends_on_both(self):
        import inspect
        from app.api.monologue_work import audio_for_lines

        features = {
            p.default.dependency.feature
            for p in inspect.signature(audio_for_lines).parameters.values()
            if hasattr(p.default, "dependency") and hasattr(p.default.dependency, "feature")
        }
        self.assertEqual(features, {"monologue_audio", "monologue_audio_hour"})

    def test_the_hour_cap_trips(self):
        from app.middleware.burst_limiter import _check_burst

        uid = 987654
        results = [_check_burst("monologue_audio_hour", uid) for _ in range(31)]
        self.assertTrue(all(r is None for r in results[:30]))
        self.assertIsNotNone(results[30])


class TheEntryIsMeasured(unittest.TestCase):
    def test_shown_and_tapped_are_client_events(self):
        self.assertTrue({"run_entry_shown", "run_entry_tapped"} <= CLIENT_EVENT_NAMES)

    def test_the_start_screen_and_the_hear_are_too(self):
        self.assertTrue({"run_start_screen_shown", "run_hear_finished"} <= CLIENT_EVENT_NAMES)


if __name__ == "__main__":
    unittest.main()
