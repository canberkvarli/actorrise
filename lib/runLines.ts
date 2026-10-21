/**
 * The lines of a monologue run, as an actor breathes them.
 *
 * The run used to put every sentence on its own line, so a piece like
 *   "It was her thing. Spirit animals. So stupid."
 * came out as three separate taps of two to four words each. That is a list of
 * fragments, not a speech. Short sentences are now gathered into one thought
 * until it has some weight, and a long sentence still stands alone.
 *
 * A short closing sentence is left on its own on purpose ("Except for the
 * wolf."): the last line of a piece is usually the button, and folding it into
 * the line before would bury it.
 */

/** A line keeps taking sentences while it is shorter than this. */
export const THOUGHT_MIN_WORDS = 8;
/** ...and never grows past this by taking one. */
export const THOUGHT_MAX_WORDS = 24;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function groupIntoThoughts(sentences: string[]): string[] {
  const out: string[] = [];
  let current = "";
  let count = 0;
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const w = words(sentence);
    if (current && count < THOUGHT_MIN_WORDS && count + w <= THOUGHT_MAX_WORDS) {
      current = `${current} ${sentence}`;
      count += w;
      continue;
    }
    if (current) out.push(current);
    current = sentence;
    count = w;
  }
  if (current) out.push(current);
  return out;
}
