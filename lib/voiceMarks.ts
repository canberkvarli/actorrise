/**
 * A drawn signature per voice, instead of a letter.
 *
 * The script used to put the character's own initial beside their name — an H
 * next to HORATIO, which is the same information twice and tells an actor
 * nothing they could not read half a centimetre to the right.
 *
 * What is actually worth marking there is the VOICE: which of the ten the
 * partner reads that character with. A voice is a sound, so it is drawn as one.
 * Each mark is four bars whose heights follow that voice's description in
 * `scenePrefs.AI_VOICES` — deep and authoritative sits low and even, light and
 * youthful runs tall and narrow, melodic rises and falls. They are small enough
 * to live in a cue line and distinct enough to tell apart at that size, which a
 * row of identical waveforms would not be.
 *
 * Heights are 0 to 1 and the component scales them; keeping the data here means
 * the shapes can be checked without rendering anything.
 */

export interface VoiceMark {
  /** Four bar heights, 0–1, left to right. */
  bars: readonly [number, number, number, number];
  /** What the shape is meant to say, for the title attribute. */
  note: string;
}

export const VOICE_MARKS: Record<string, VoiceMark> = {
  // Masculine — weight low in the frame.
  ash: { bars: [0.55, 0.9, 0.75, 0.45], note: "warm, deep" },
  echo: { bars: [0.5, 0.7, 0.7, 0.5], note: "smooth, even" },
  fable: { bars: [0.4, 0.85, 0.5, 0.95], note: "expressive, British" },
  onyx: { bars: [0.85, 1, 0.9, 0.8], note: "deep, authoritative" },

  // Feminine — brighter, taller, more movement.
  coral: { bars: [0.45, 0.8, 1, 0.6], note: "warm, expressive" },
  nova: { bars: [0.9, 0.55, 1, 0.7], note: "bright, energetic" },
  sage: { bars: [0.6, 0.6, 0.65, 0.6], note: "calm, measured" },
  shimmer: { bars: [0.75, 1, 0.65, 0.95], note: "light, youthful" },

  // Neutral — balanced, or a deliberate rise and fall.
  alloy: { bars: [0.65, 0.65, 0.65, 0.65], note: "balanced, clear" },
  ballad: { bars: [0.35, 0.7, 1, 0.55], note: "melodic, theatrical" },
};

/** Fallback keeps the row drawn rather than leaving a hole. */
const UNKNOWN: VoiceMark = { bars: [0.6, 0.6, 0.6, 0.6], note: "voice" };

export function voiceMark(voiceId: string | null | undefined): VoiceMark {
  return VOICE_MARKS[(voiceId || "").toLowerCase()] ?? UNKNOWN;
}
