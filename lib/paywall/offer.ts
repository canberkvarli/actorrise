/**
 * What a hard wall offers, as words and links. Pure: the caller owns the clock.
 *
 * Why the walls lead with the year (2026-10-31, last 30 days): the walls get
 * the clicks (rehearsal 6 of 29, read 3 of 18) but of 15 clicks only 2 finished
 * Stripe checkout, and trials themselves convert about 45%. So the wall's job
 * is to make the decision before the card form does: one plan, one price, the
 * exact day money moves. Plus by the year is $99, which is $8.25 a month; the
 * month-to-month $12 stays one tap away.
 *
 * Honest about the charge. There is no email before a trial ends (Canberk's
 * call, 2026-09-29), so nothing here promises one. It names the date instead.
 *
 * The trial length is the server's (trial_days on /api/subscriptions/me, via
 * lib/trial.ts). Nothing in here carries its own number of days.
 */

import type { TrialWords } from "@/lib/trial";

export const PLUS_MONTHLY_CENTS = 1200;
export const PLUS_ANNUAL_CENTS = 9900;

const dollars = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

/** "$8.25" */
export const PLUS_PER_MONTH_ON_ANNUAL = dollars(Math.round(PLUS_ANNUAL_CENTS / 12));
/** "$99" */
export const PLUS_ANNUAL = dollars(PLUS_ANNUAL_CENTS);
/** "$12" */
export const PLUS_MONTHLY = dollars(PLUS_MONTHLY_CENTS);

/** What the actor ran into. Decides which gain the list leads with. */
export type WallKind = "read" | "search" | "rehearse" | "sides";

/**
 * What Plus buys, in an actor's words. Checked against the Plus row in
 * backend/app/core/seed.py: unlimited reads on any paid tier
 * (subscriptions.usage_limits), ai_searches_per_month -1, monologue_sessions
 * -1, scene_partner_scripts 5 and scene_partner_sessions -1. Nothing here that
 * the free tier already has (saving, downloads, notes).
 */
export const PLUS_GAINS: Record<WallKind, string> = {
  read: "Every monologue in the library, start to finish",
  search: "Search as much as you like",
  rehearse: "Rehearse any piece, as many runs as it takes",
  sides: "Your own sides, five scripts a month, run with a scene partner",
};

/** The four gains, the one they just ran into first. */
export function plusGains(lead: WallKind): string[] {
  const order: WallKind[] = ["read", "search", "rehearse", "sides"];
  return [PLUS_GAINS[lead], ...order.filter((k) => k !== lead).map((k) => PLUS_GAINS[k])];
}

export type PlusOffer = {
  /** The annual checkout, the default. */
  href: string;
  /** Month to month, the quiet second option. */
  monthlyHref: string;
  cta: string;
  /** "$8.25" */
  perMonth: string;
  /** "a month, billed $99 a year" */
  perMonthNote: string;
  /** The printed account under the price: [label, figure]. */
  rows: [string, string][];
  /** One plain sentence on when money moves and how to stop it. */
  fine: string;
  monthlyLabel: string;
};

/** "November 7" */
export function chargeDate(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function plusOffer(
  from: string,
  words: Pick<TrialWords, "days" | "tasted" | "short">,
  now: Date,
): PlusOffer {
  const gate = encodeURIComponent(from);
  const trial = words.tasted ? 0 : 1;
  const href = `/checkout?tier=plus&period=annual&trial=${trial}&from=${gate}`;
  const monthlyHref = `/checkout?tier=plus&period=monthly&trial=${trial}&from=${gate}`;
  const perMonth = PLUS_PER_MONTH_ON_ANNUAL;
  const perMonthNote = `a month, billed ${PLUS_ANNUAL} a year`;

  if (words.tasted) {
    return {
      href,
      monthlyHref,
      cta: `Keep Plus, ${PLUS_ANNUAL} a year`,
      perMonth,
      perMonthNote,
      rows: [["Today", `${PLUS_ANNUAL} for the year`]],
      fine: "Cancel any time and it won't renew.",
      monthlyLabel: `or ${PLUS_MONTHLY} month to month`,
    };
  }

  const on = chargeDate(now, words.days);
  return {
    href,
    monthlyHref,
    cta: `Start ${words.short}`,
    perMonth,
    perMonthNote,
    rows: [
      ["Today", "$0"],
      [on, `${PLUS_ANNUAL} for the year`],
    ],
    fine: `Card on file. Cancel before ${on} and you pay nothing.`,
    monthlyLabel: `or ${PLUS_MONTHLY} month to month`,
  };
}
