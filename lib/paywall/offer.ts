/**
 * What a hard wall offers, as words and links. Pure: the caller owns the clock.
 *
 * The walls lead with the month again (2026-11-09, Canberk). Under the year-led
 * wall below, clicks fell from about 1 in 5 who saw a wall to 1 in 21 in its
 * first full week: "$99" printed a week out is a big decision for someone three
 * pieces in, and $12 is a small one. The year stays one tap away. Read the
 * change by WALL_VARIANT on paywall_hit.
 *
 * Why the walls led with the year before that (2026-10-31, last 30 days): the walls get
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
  /** The month-to-month checkout, the default. */
  href: string;
  /** By the year, the quiet second option. */
  annualHref: string;
  cta: string;
  /** "$12" */
  perMonth: string;
  /** "a month, cancel any time" */
  perMonthNote: string;
  /** The printed account under the price: [label, figure]. */
  rows: [string, string][];
  /** One plain sentence on when money moves and how to stop it. */
  fine: string;
  annualLabel: string;
};

/** "November 7" */
export function chargeDate(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/**
 * Logged on paywall_hit from every hard wall, so the month-led wall can be
 * read against the year-led one it replaced (those rows carry no variant).
 * Change the words, change the letter.
 */
export const WALL_VARIANT = "wall_monthly_a";

export function plusOffer(
  from: string,
  words: Pick<TrialWords, "days" | "tasted" | "short">,
  now: Date,
): PlusOffer {
  const gate = encodeURIComponent(from);
  const trial = words.tasted ? 0 : 1;
  const href = `/checkout?tier=plus&period=monthly&trial=${trial}&from=${gate}`;
  const annualHref = `/checkout?tier=plus&period=annual&trial=${trial}&from=${gate}`;
  const perMonth = PLUS_MONTHLY;
  const perMonthNote = "a month, cancel any time";
  const annualLabel = `or ${PLUS_ANNUAL} a year, ${PLUS_PER_MONTH_ON_ANNUAL} a month`;

  if (words.tasted) {
    return {
      href,
      annualHref,
      cta: `Keep Plus, ${PLUS_MONTHLY} a month`,
      perMonth,
      perMonthNote,
      rows: [["Today", PLUS_MONTHLY]],
      fine: "Cancel any time and it won't renew.",
      annualLabel,
    };
  }

  const on = chargeDate(now, words.days);
  return {
    href,
    annualHref,
    cta: `Start ${words.short}`,
    perMonth,
    perMonthNote,
    rows: [
      ["Today", "$0"],
      [on, `${PLUS_MONTHLY}, then monthly`],
    ],
    fine: `Card on file. Cancel before ${on} and you pay nothing.`,
    annualLabel,
  };
}
