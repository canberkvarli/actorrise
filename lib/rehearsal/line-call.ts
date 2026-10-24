/**
 * "Line!" said out loud. Stuck, an actor stops and calls for a line, the way
 * they would to a prompter, and the next words show (book.ts nextPrompt). No
 * hands: the mic is already listening to them.
 *
 * A call is the word on its own after a stop: the first word heard since the
 * transcript last went quiet (or since the line opened), when it is not the
 * word the line goes on with. "Draw the line here" read straight through is
 * the line; "line" where the script says "line" is the line. A "please" after
 * a call is part of it. Calls are taken out of what the reading is matched
 * against, so a call is never a word of the line, and it never ends one.
 *
 * Pure, so line-call.test.ts pins it without a microphone.
 */
import { wordsMatch } from '../word-match';

/** "line", and what the transcriber makes of it. Not "lie": scripts say lie. */
export const CALL_WORDS = new Set(['line', 'lines', 'lion', 'lyon']);
const POLITE = 'please';

export interface Split {
  /** The transcript without the calls, for liveRead. */
  spoken: string;
  /** Token indices of every call this turn. Only ever grows. */
  calls: Set<number>;
  /** The last thing heard was a call: the actor is waiting on the prompt. */
  waiting: boolean;
}

/**
 * `tokens` is the turn's transcript, tokenized; `quietAt` the token count when
 * it last went quiet (0 at the turn's start); `next` the word the line goes on
 * with, if any; `known` the calls found on earlier deltas. A call once found
 * stays one: the transcriber revising the word must not count it twice.
 */
export function splitCalls(tokens: string[], next: string | undefined, quietAt: number, known: ReadonlySet<number>): Split {
  const calls = new Set(known);
  const k = quietAt;
  if (k < tokens.length && CALL_WORDS.has(tokens[k]) && !(next && wordsMatch(next, tokens[k]))) calls.add(k);
  const out: string[] = [];
  let waiting = false;
  for (let i = 0; i < tokens.length; i++) {
    if (calls.has(i) && CALL_WORDS.has(tokens[i])) { waiting = true; continue; }
    if (tokens[i] === POLITE && calls.has(i - 1)) continue;
    out.push(tokens[i]);
    waiting = false;
  }
  return { spoken: out.join(' '), calls, waiting };
}
