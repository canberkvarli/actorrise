/**
 * Pure helpers for Memorization mode.
 *
 * No React / DOM here — keep these unit-test friendly.
 */

const MIDDOT = "·"; // · U+00B7

/** True for an alphabetic character (Unicode-aware, letters only). */
function isAlpha(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

/** True for whitespace, which marks a word boundary. */
function isWhitespace(ch: string): boolean {
  return /\s/u.test(ch);
}

/**
 * Mask a line for the "Hints" level.
 *
 * For each run of characters, keep the FIRST alphabetic char of every word and
 * replace each subsequent alphabetic char with a middot (·). All non-alphabetic
 * characters (spaces, punctuation, apostrophes, digits) are kept as-is, which
 * preserves the original spacing and length.
 *
 *   "To be, or not" -> "T· b·, o· n··"
 *   "don't"         -> "d··'·"
 */
export function maskFirstLetters(text: string): string {
  let sawFirstLetterOfWord = false;
  let out = "";

  // Iterate by code points so multi-byte letters mask correctly.
  for (const ch of text) {
    if (isAlpha(ch)) {
      if (!sawFirstLetterOfWord) {
        out += ch;
        sawFirstLetterOfWord = true;
      } else {
        out += MIDDOT;
      }
    } else {
      // Keep the char as-is. Only whitespace ends a "word" — this way an
      // in-word apostrophe ("don't" -> "d··'·") doesn't reset the first-letter
      // state, while a space ("To be" -> "T· b·") does.
      out += ch;
      if (isWhitespace(ch)) sawFirstLetterOfWord = false;
    }
  }

  return out;
}

/**
 * Split a monologue's body text into display "lines".
 *
 * Strategy:
 *   1. Split on newlines, trim, drop empties.
 *   2. If that yields a single chunk (no real line breaks), fall back to
 *      sentence splitting on `/(?<=[.!?])\s+/`.
 *
 * Always returns trimmed, non-empty strings.
 */
export function splitMonologue(text: string): string[] {
  if (!text) return [];

  const byNewline = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (byNewline.length > 1) {
    return byNewline;
  }

  const single = byNewline[0] ?? text.trim();
  if (!single) return [];

  return single
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
