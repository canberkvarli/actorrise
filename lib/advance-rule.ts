/**
 * When has the actor finished their line?
 *
 * The rule this replaces raced on word count: hit 70% of the tokens and the
 * scene moved on, which fires *while the actor is still speaking*. Two words
 * into "Twenty-four, and I've been doing this since I was nine" is enough to
 * clear 70% on a short line, and the actor gets cut off mid-sentence.
 *
 * The fix is to stop asking "have they said enough words" and start asking
 * "have they stopped talking". Microphone level answers that in about a frame;
 * speech recognition takes 500–800ms to finalize an utterance, which is most of
 * the lag between the last syllable and the next line.
 *
 * Kept pure so lib/advance-rule.test.ts can pin it without a browser or a mic.
 */

export interface AdvanceState {
  /** Milliseconds since the microphone last heard voiced audio. */
  msSinceVoice: number;
  /** Fraction of the written line matched so far, 0–1. */
  score: number;
  /** Has the final word of the line been matched? */
  lastWordMatched: boolean;
  /** Has any speech at all been heard during this take? */
  heardAnySpeech: boolean;
}

/**
 * Quiet required before the scene may move on.
 *
 * Short enough to feel like a scene partner picking up their cue, long enough
 * that the gap between two words in a sentence never trips it.
 */
export const MIN_QUIET_MS = 180;

/** Half a line is enough context to trust that a final-word match is genuinely final. */
const ENDING_MIN_SCORE = 0.5;

/** Quiet after which a nearly-complete read counts as done even if the tail was misheard. */
const DROPPED_TAIL_QUIET_MS = 900;
const DROPPED_TAIL_MIN_SCORE = 0.75;

/** Quiet after which any take at all moves on, so a trailed-off line is never a trap. */
const TRAILED_OFF_QUIET_MS = 2500;

/**
 * Should the scene move to the next line?
 *
 * Ordered from the common case to the safety nets. Silence with no speech at all
 * is deliberately not handled here — that belongs to the skip-if-silent timer,
 * which is a different decision with a different setting behind it.
 */
export function shouldAdvance({
  msSinceVoice,
  score,
  lastWordMatched,
  heardAnySpeech,
}: AdvanceState): boolean {
  // The invariant: never interrupt someone who is still making sound.
  if (msSinceVoice < MIN_QUIET_MS) return false;
  if (!heardAnySpeech) return false;

  // They reached the end of the line and stopped. Go, immediately.
  if (lastWordMatched && score >= ENDING_MIN_SCORE) return true;

  // Recognition lost the last word or two, but they clearly read the line.
  if (score >= DROPPED_TAIL_MIN_SCORE && msSinceVoice >= DROPPED_TAIL_QUIET_MS) return true;

  // They stopped somewhere in the middle and aren't coming back.
  //
  // Guarded on having recognized *something*. A score of zero against an audible
  // actor means recognition is failing on this line, not that they stopped
  // early — and advancing cancels the Whisper transcription that is their only
  // remaining chance of being heard. That take belongs to Whisper's own
  // silence detection, not to this rule.
  if (score > 0 && msSinceVoice >= TRAILED_OFF_QUIET_MS) return true;

  return false;
}
