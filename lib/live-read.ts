/**
 * The actor's line, read as they say it.
 *
 * What this replaces is the reason rehearsal never felt live. The old capture
 * was a batch: open the mic, record a take, notice they stopped, upload the
 * file, wait for a transcript, then decide. Nothing in that sequence knows a
 * word while the actor is still saying it, so the lag was structural and no
 * threshold could tune it away.
 *
 * Seven mechanisms had grown up around that gap, all of them guessing at the
 * one thing the design could not observe — whether the actor had finished.
 * There was a microphone level gate, a minimum quiet, a dropped-tail rule, a
 * trailed-off rule, a finished-and-still rule, a self-heal timeout and a
 * skip-if-silent timer. Seven answers to one question is what it looks like
 * when none of them is the real one, and between them they cut actors off
 * mid-speech, stranded them on noisy rooms, and once moved a scene on for an
 * actor who had said nothing at all.
 *
 * A streaming session answers the question directly. Words arrive as deltas
 * while the actor speaks, and the server's semantic turn detection — a model,
 * not a volume gate — says when the thought is finished. So the decision here
 * has two clauses and no timers:
 *
 *   1. The last word of the speech has been heard. Go now.
 *   2. The turn ended and we heard some of it. Go.
 *
 * Clause 1 is the common case and waits on nothing, which is why it feels
 * immediate: an actor who reads to the end of their line hands over on the
 * final syllable. Clause 2 is the only safety net, and it is the server's
 * judgement rather than ours.
 *
 * Pure, so live-read.test.ts pins it without a microphone or a browser.
 */

import { alignWords, tokenize } from './word-match';

export interface LiveRead {
  /** Indices into the line's words that have been heard, in order. */
  matched: Set<number>;
  /** Has the final word of the line been heard? */
  lastWordMatched: boolean;
  /** Fraction of the line reached, 0–1. */
  score: number;
}

/** An empty read, for before the actor has said anything. */
export const EMPTY_READ: LiveRead = {
  matched: new Set(),
  lastWordMatched: false,
  score: 0,
};

/**
 * Match the transcript so far against the line.
 *
 * Called on every delta, so it is handed the whole transcript each time rather
 * than an increment: `alignWords` walks the transcript cursor forward only, so
 * re-reading from the start is both cheap at line length and immune to a
 * provider that revises earlier words — which the streaming transcriber does,
 * routinely, as more audio arrives.
 */
export function liveRead(expectedWords: string[], transcript: string): LiveRead {
  if (!expectedWords.length) {
    return { matched: new Set(), lastWordMatched: true, score: 1 };
  }
  const matched = alignWords(expectedWords, tokenize(transcript));
  return {
    matched,
    lastWordMatched: matched.has(expectedWords.length - 1),
    score: matched.size / expectedWords.length,
  };
}

/**
 * A line's words, ready to match against.
 *
 * Stage directions are stripped by the caller; this is only the tokenizing, so
 * that the page and the matcher cannot disagree about what counts as a word.
 */
export function lineWords(text: string): string[] {
  return tokenize(text);
}

/**
 * Enough of the line to believe a final-word match is genuinely final.
 *
 * A one-word echo of the last word on the page — common when a transcriber is
 * primed with the script and hears a cough — should not hand the scene over.
 * Half the line is the same bar the batch rule used, and it held up.
 */
const ENDING_MIN_SCORE = 0.5;

export interface HandOverState extends LiveRead {
  /**
   * Has the session's turn detection said the actor stopped?
   *
   * This is `semantic_vad`: a model's read of whether the thought is complete,
   * not a silence timer. It waits longer when a line trails off on "and I
   * just…" than when it lands, which is the distinction a volume threshold
   * could never make and the reason there are no timers left in here.
   */
  turnEnded: boolean;
}

/** Should the scene move to the next line? */
export function shouldHandOver({
  matched,
  lastWordMatched,
  score,
  turnEnded,
}: HandOverState): boolean {
  // They reached the end of the line. This is the whole point: no wait at all.
  if (lastWordMatched && score >= ENDING_MIN_SCORE) return true;

  /* The turn is over and something was heard. Guarded on having heard
     anything, because a turn that ends with an empty transcript is a room
     noise false positive, and moving the scene on for an actor who has not
     spoken is the failure that started all of this. */
  if (turnEnded && matched.size > 0) return true;

  return false;
}
