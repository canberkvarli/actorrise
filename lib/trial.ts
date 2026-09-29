/**
 * A trial length as the words the product prints.
 *
 * The length is decided on the server (backend/app/services/trial_length.py):
 * a week, or two for an actor who has finished a scene. It arrives on
 * /api/subscriptions/me as trial_days. Nothing in the client carries its own
 * number. Twelve surfaces used to say "2 weeks" by hand, which is how a changed
 * offer goes on being quoted at the old length.
 *
 * Pure. The hook that reads the subscription is hooks/useTrialWords.ts.
 */

export type TrialWords = {
  days: number;
  /** "Start 1 week free" */
  cta: string;
  /** "1 week free" */
  short: string;
  /** "a week", for the middle of a sentence */
  span: string;
  /** True once the actor has finished a scene and the second week is theirs. */
  earned: boolean;
};

export const DEFAULT_TRIAL_DAYS = 7;

export function trialWords(days: number | undefined | null, earned = false): TrialWords {
  const d = days && days > 0 ? days : DEFAULT_TRIAL_DAYS;
  const short = d === 7 ? "1 week free" : d === 14 ? "2 weeks free" : `${d} days free`;
  const span = d === 7 ? "a week" : d === 14 ? "two weeks" : `${d} days`;
  return { days: d, cta: `Start ${short}`, short, span, earned };
}

/** "a week" -> "A week", for the start of a sentence. */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
