/**
 * Pure helpers for Memorization mode.
 *
 * No React / DOM here — keep these unit-test friendly.
 */

import { monologueSegments } from "@/lib/monologueSegments";

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
 * Delegates to the shared segmenter so a "line" is the same unit everywhere.
 * It used to have its own rule — split on newlines, else split on
 * `/(?<=[.!?])\s+/` — which disagreed with the cut editor's in two ways that
 * showed: a paragraph break made this return two enormous chunks, and a bare
 * "..." or a two-word sentence became a line of its own. Drilling a piece and
 * cutting a piece then operated on different lists, so a saved cut's indices
 * did not point at the lines Memorize was showing.
 */
export function splitMonologue(text: string): string[] {
  return monologueSegments(text);
}
