"""Tests for the deterministic monologue quality gate.

This gate runs at extraction time (before GPT selection / DB storage) and HARD
rejects anything that isn't a clean, continuous, single-speaker monologue. It is
the guarantee that scraped TV transcripts don't leak interleaved dialogue, cue
artifacts ([LAUGHTER], (beat)), scene headings, HTML/unicode junk, or mid-sentence
truncation into the library.
"""

import unittest

from app.services.extraction.monologue_quality import (
    DEFAULT_MIN_WORDS,
    strip_artifacts,
)
from app.services.extraction.monologue_quality import (
    assess_monologue_quality as _assess,
)


def assess_monologue_quality(text, **kw):
    """Shadow the gate with a low floor, so these tests test what they name.

    Every fixture below is a hand-written specimen of ONE artifact — a bracket
    cue, a scene heading, a footnote. They were written around 60 words, which
    was comfortably over the old 40-word floor and is now under the 75-word one,
    so raising the floor turned all of them into `too_short` and stopped them
    exercising the artifact they exist to catch.

    Length is policy and is tested on its own in :class:`LengthTests`.
    """
    kw.setdefault("min_words", 40)
    return _assess(text, **kw)


# A clean, audition-length single-speaker monologue (≈70 words, ends on a period).
CLEAN = (
    "When I was a girl my mother told me the sea takes what it wants and gives "
    "nothing back. I did not believe her then. I climbed the rocks and dared the "
    "water to touch me. Now I stand on the same shore and I understand. Everything "
    "I loved is under that grey surface, and still I come here every morning, "
    "waiting for the tide to change its mind. It never does. It never will."
)


class CleanMonologueTests(unittest.TestCase):
    def test_clean_monologue_passes(self):
        result = assess_monologue_quality(CLEAN)
        self.assertTrue(result.ok, result.reasons)
        self.assertEqual(result.reasons, [])

    def test_internal_dash_and_ellipsis_are_fine(self):
        text = (
            "I wanted to tell you - really, I did - but the words never came. "
            "Maybe tomorrow... maybe never. I have made my peace with the silence "
            "between us, and I will carry it the way I carry everything else: quietly."
        )
        self.assertTrue(assess_monologue_quality(text).ok)


class SingleSpeakerTests(unittest.TestCase):
    def test_interleaved_speaker_label_is_rejected(self):
        text = (
            "I never meant for any of this to happen, you have to believe me.\n"
            "MARIA: Then why did you lie?\n"
            "Because I was afraid of what you would think of me."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("interleaved_speaker", result.reasons)

    def test_screenplay_continued_label_is_rejected(self):
        text = (
            "You think you know me but you don't know the first thing.\n"
            "JOHN (CONT'D)\n"
            "You never did."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("interleaved_speaker", result.reasons)

    def test_legitimate_midsentence_colon_is_not_a_speaker(self):
        text = (
            "Here is the truth I have been hiding: I was never going to leave this "
            "town, not for you, not for anyone, because some part of me has always "
            "belonged to these crooked streets and the people who walk them. I am "
            "staying, and you cannot talk me out of it."
        )
        self.assertTrue(assess_monologue_quality(text).ok)


class ArtifactTests(unittest.TestCase):
    def test_bracket_cue_is_rejected(self):
        text = (
            "I have waited my whole life to say this to your face. [LAUGHTER] "
            "And now that the moment is here, I find I am not afraid of you at all."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("bracket_cue", result.reasons)

    def test_a_stage_direction_is_kept_not_rejected(self):
        """Directions annotate the speech; they are not a reason to bin it.

        This gate used to reject on presence, which quietly undid the work of
        `to_display_text` (which preserves directions so the reader can show
        them as italic asides). Every play speech carrying a wrylie was thrown
        away at ingest.
        """
        text = (
            "You walked out that door and you never looked back. (beat) "
            "I counted the days. I counted every single one of them until I lost "
            "count entirely and the counting stopped meaning anything at all. I "
            "stayed in that house another winter, waiting for a knock that never "
            "came, and I am only now learning how to stop listening for it."
        )
        result = assess_monologue_quality(text)
        self.assertTrue(result.ok, result.reasons)

    def test_direction_heavy_text_is_rejected(self):
        """A scene description with a line in it is not a monologue."""
        text = (
            "(He crosses to the window and stands there a long while, watching "
            "the rain come down over the rooftops of the sleeping town below.) "
            "I suppose that is that. "
            "(She rises, gathers her coat from the chair, and goes to the door, "
            "where she pauses with her hand resting on the frame.)"
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("direction_heavy", result.reasons)

    def test_many_small_directions_are_rejected(self):
        """Under the share, over the count: a transcript, not a speech."""
        beats = " ".join(f"(beat) Line number {i} of this thing." for i in range(12))
        result = assess_monologue_quality(beats)
        self.assertFalse(result.ok)
        self.assertIn("direction_heavy", result.reasons)

    def test_scene_heading_is_rejected(self):
        text = (
            "INT. KITCHEN - NIGHT\n"
            "I told you I would wait and I meant it, every word, to the last breath."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("scene_heading", result.reasons)

    def test_html_residue_is_rejected(self):
        text = (
            "I won&#39;t apologize for who I am, not anymore. <br> "
            "I spent twenty years saying sorry and I am finished with it now."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("html_residue", result.reasons)

    def test_replacement_and_control_chars_are_rejected(self):
        text = (
            "I remember the night you left� the rain, the slammed door, "
            "the way the whole house went\x07 silent. I have never forgotten any of it."
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("weird_chars", result.reasons)


class ScreenplayResidueTests(unittest.TestCase):
    """Real garbage the TV spike surfaced from flattened teleplay PDFs.

    These slipped through the first gate version (no `NAME:` colon, line
    structure lost in PDF flattening). The hardened gate must reject them.
    """

    def test_interleaved_caps_cues_without_colon(self):
        # Mad Men: two speakers (EMERSON / PEGGY) merged + an action line.
        text = (
            "EMERSON It's really for your own good, but the fact is, even in our "
            "modern times, easy women don't find husbands. PEGGY I understand, "
            "Dr. Emerson. I really am a very responsible person. He turns away."
        )
        self.assertFalse(assess_monologue_quality(text).ok)

    def test_scene_action_block_is_rejected(self):
        # Game of Thrones: pure scene/action description, no dialogue.
        text = (
            "KING'S LANDING MAIN GATES - DAY Snow has begun to fall and will "
            "continue throughout this day. TYRION LANNISTER steels himself and "
            "heads inside the smoldering wreck of the city he once tried to save."
        )
        self.assertFalse(assess_monologue_quality(text).ok)

    def test_scholarly_footnote_is_rejected(self):
        # A Gutenberg edition's textual note, mis-captured as a speech by the
        # play extractor: opens with a line/page citation.
        text = (
            "4. 111-113. Mr Sidney Walker adopts Steevens' emendation, and "
            "affirms that among all the many conjectures on this passage none is "
            "so probable as that the reading of the Folio is corrupt here."
        )
        self.assertFalse(assess_monologue_quality(text).ok)

    def test_dialogue_starting_with_a_number_is_not_a_footnote(self):
        # A real line that happens to start with a number must still pass.
        text = (
            "20 years I gave to this company, and what do I have to show for it? "
            "Not a handshake, not a thank you, nothing but a gold watch and the "
            "door. Well, I am done being grateful for scraps. I am done."
        )
        self.assertTrue(assess_monologue_quality(text).ok)

    def test_name_dot_speaker_cue_is_rejected(self):
        # Play library: classic "NAME . dialogue" cue with two characters.
        text = (
            "And a bad father? That's what you mean, eh? VALENTINE . Miss "
            "Clandon, I never said any such thing. CRAMPTON . That girl's name "
            "is Crampton, and she will hear me out before this night is over."
        )
        self.assertFalse(assess_monologue_quality(text).ok)


class TruncationTests(unittest.TestCase):
    def test_no_terminal_punctuation_is_truncated(self):
        text = (
            "I came back to this house after all these years to finally tell you "
            "the truth about what happened the summer your mother died, about the "
            "money that went missing, about your brother and the promise I made to "
            "him, about every last piece of it and"
        )
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("truncated_end", result.reasons)

    def test_trailing_quote_after_period_is_fine(self):
        text = (
            "My father had one rule and he repeated it until it became my own "
            "heartbeat. He would look at me across the breakfast table, every "
            "single morning of my childhood, and say the same six words. I did not "
            "understand them then. I understand them now, standing here without "
            "him. He would say, \"Never let them see you flinch.\""
        )
        self.assertTrue(assess_monologue_quality(text).ok)


class LengthTests(unittest.TestCase):
    """These call the real gate, not the shadow — length IS what they test."""

    def test_the_floor_is_seventy_five_words(self):
        """~30s at 150wpm. Below that it is a clip, not a piece you can offer."""
        self.assertEqual(DEFAULT_MIN_WORDS, 75)

    def test_a_sixty_word_speech_is_now_too_short(self):
        """The old 40-word floor admitted 6,165 rows no actor could use."""
        text = " ".join(["word"] * 60) + "."
        result = _assess(text)
        self.assertFalse(result.ok)
        self.assertIn("too_short", result.reasons)

    def test_too_short_is_rejected(self):
        result = assess_monologue_quality("I am leaving and I am not coming back.")
        self.assertFalse(result.ok)
        self.assertIn("too_short", result.reasons)

    def test_too_long_is_rejected(self):
        text = ("word " * 600).strip() + "."
        result = assess_monologue_quality(text)
        self.assertFalse(result.ok)
        self.assertIn("too_long", result.reasons)

    def test_empty_is_rejected(self):
        result = assess_monologue_quality("   \n  ")
        self.assertFalse(result.ok)
        self.assertIn("empty", result.reasons)


class StripArtifactsTests(unittest.TestCase):
    def test_strips_parenthetical_and_rejoins_cleanly(self):
        dirty = (
            "You walked out that door and you never looked back. (beat) "
            "I counted the days, every single one of them, until I lost count "
            "entirely and the counting stopped meaning anything at all. I stayed "
            "in that house another winter, waiting for a knock that never came, "
            "and I am only now learning how to stop listening for it."
        )
        cleaned = strip_artifacts(dirty)
        self.assertNotIn("(", cleaned)
        self.assertIn("looked back. I counted", cleaned)
        self.assertTrue(assess_monologue_quality(cleaned).ok)

    def test_strips_bracket_cue(self):
        cleaned = strip_artifacts("I have waited my whole life. [LAUGHTER] And here we are.")
        self.assertNotIn("[", cleaned)
        self.assertNotIn("LAUGHTER", cleaned)

    def test_cannot_fix_interleaved_speakers(self):
        # structurally broken — stripping ()/[] leaves two speakers; stays flagged
        dirty = "EMERSON It's for your own good. PEGGY I understand you completely."
        self.assertFalse(assess_monologue_quality(strip_artifacts(dirty)).ok)


if __name__ == "__main__":
    unittest.main()
