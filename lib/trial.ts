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
  /**
   * True once the three days of Plus from the read wall are over. There is no
   * trial left: checkout charges today and the words say so.
   */
  tasted: boolean;
  /** The line under a wall's button. */
  terms: string;
  /**
   * What the first wall after a taste says, once tasted: what they had and
   * lost. Empty strings otherwise.
   */
  overTitle: string;
  overBody: string;
};

/** The taste as /me reports it (backend services/taste.py). */
export type TasteState = {
  had: boolean;
  active: boolean;
  ends_at: string | null;
  /** Whole days it was granted for (3 at the read wall, 7 for the reverse trial). */
  days?: number | null;
} | null | undefined;

/**
 * How long the taste ran, in days, if /me says. The three-day taste and the
 * seven-day reverse trial are the same mechanism with different lengths, so
 * the length is read, never assumed.
 */
export function tasteDays(taste: TasteState): number | null {
  if (!taste) return null;
  return taste.days && taste.days > 0 ? taste.days : null;
}

/** "a week", "3 days": how a length of free Plus reads in a sentence. */
export function spanOfDays(days: number): string {
  if (days === 7) return "a week";
  if (days === 14) return "two weeks";
  if (days === 1) return "a day";
  return `${days} days`;
}

/** "Your week of Plus ended." Says the length only when it is known. */
export function tasteOverTitle(days: number | null): string {
  if (!days) return "Your free Plus ended.";
  const noun = days === 7 ? "week" : days === 14 ? "two weeks" : days === 1 ? "day" : `${days} days`;
  return `Your ${noun} of Plus ended.`;
}

export const TASTE_OVER_BODY =
  "You had every piece, every search and every run. Keep all of it.";

/** Where a wall's button goes. No trial after the taste; the server agrees. */
export function plusHref(from: string, tasted: boolean): string {
  return tasted
    ? `/checkout?tier=plus&period=monthly&trial=0&from=${from}`
    : `/checkout?tier=plus&period=monthly&trial=1&from=${from}`;
}

export const DEFAULT_TRIAL_DAYS = 7;

export function trialWords(
  days: number | undefined | null,
  earned = false,
  tasted = false,
  tastedDays: number | null = null,
): TrialWords {
  if (tasted) {
    return {
      days: 0,
      cta: "Keep Plus",
      short: "$12 a month",
      span: "",
      earned: false,
      tasted: true,
      terms: "$12 a month or $99 a year. Cancel any time.",
      overTitle: tasteOverTitle(tastedDays),
      overBody: TASTE_OVER_BODY,
    };
  }
  const d = days && days > 0 ? days : DEFAULT_TRIAL_DAYS;
  const short = d === 7 ? "1 week free" : d === 14 ? "2 weeks free" : `${d} days free`;
  const span = d === 7 ? "a week" : d === 14 ? "two weeks" : `${d} days`;
  return {
    days: d,
    cta: `Start ${short}`,
    short,
    span,
    earned,
    tasted: false,
    terms: "Card on file, cancel before it renews.",
    overTitle: "",
    overBody: "",
  };
}

/** "a week" -> "A week", for the start of a sentence. */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
