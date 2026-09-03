/**
 * Where in its line is the AI voice right now?
 *
 * OpenAI's text-to-speech returns audio and nothing else — no word timings — so
 * the karaoke sweep on the scene partner's line is estimated: spread the clip's
 * duration across the words in proportion to how long each takes to say.
 * Syllable count is a far better proxy for that than character count, which
 * would let "through" outrun "away".
 *
 * The browser speech-synthesis path doesn't need any of this; it fires real
 * `onboundary` events and should use them.
 *
 * Pure, so lib/speech-timing.test.ts pins it without playing any audio.
 */

export interface WordTiming {
  /** Milliseconds from the start of the clip. */
  start: number;
  end: number;
}

/**
 * Roughly how many syllables a word takes to say.
 *
 * Vowel groups, minus a silent trailing "e". Wrong on plenty of English, but
 * it only has to be closer than "every word takes the same time", and it is.
 */
export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;

  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 0;

  // "nine" and "have" are one syllable, not two.
  if (n > 1 && /[^aeiouy]e$/.test(w)) n -= 1;

  return Math.max(1, n);
}

/**
 * Slice a clip's duration across its words, proportional to syllable count.
 *
 * Slots are contiguous and span the whole clip, so the sweep neither stalls nor
 * finishes early. An unknown duration returns nothing — better no sweep at all
 * than one racing ahead of the voice.
 */
export function buildWordTimings(words: string[], durationMs: number): WordTiming[] {
  if (!words.length || !(durationMs > 0)) return [];

  const weights = words.map(syllableCount);
  const total = weights.reduce((a, b) => a + b, 0);

  const timings: WordTiming[] = [];
  let elapsed = 0;
  for (let i = 0; i < words.length; i++) {
    const start = elapsed;
    // Last word closes on the duration exactly, so rounding can't leave a gap.
    elapsed = i === words.length - 1 ? durationMs : start + (weights[i] / total) * durationMs;
    timings.push({ start, end: elapsed });
  }
  return timings;
}

/**
 * Which word is being spoken at `elapsedMs`.
 *
 * Clamped to the last word so the final one stays lit through any trailing
 * silence in the clip, rather than the highlight vanishing before the audio does.
 *
 * @returns index into the word list, or -1 when there is nothing to track.
 */
export function spokenWordIndex(timings: WordTiming[], elapsedMs: number): number {
  if (!timings.length) return -1;
  for (let i = 0; i < timings.length; i++) {
    if (elapsedMs < timings[i].end) return i;
  }
  return timings.length - 1;
}
