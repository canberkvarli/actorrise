import { describe, expect, it } from "vitest";
import { trialWords } from "../trial";
import { chargeDate, plusGains, plusOffer, PLUS_GAINS, PLUS_PER_MONTH_ON_ANNUAL } from "./offer";

// Noon UTC, so the printed day is the same in any test runner's timezone.
const NOW = new Date("2026-10-31T12:00:00Z");

describe("plusOffer", () => {
  it("leads with the year, priced by the month", () => {
    const o = plusOffer("monologue_read", trialWords(7), NOW);
    expect(PLUS_PER_MONTH_ON_ANNUAL).toBe("$8.25");
    expect(o.perMonth).toBe("$8.25");
    expect(o.perMonthNote).toBe("a month, billed $99 a year");
    expect(o.href).toBe("/checkout?tier=plus&period=annual&trial=1&from=monologue_read");
    expect(o.monthlyHref).toBe("/checkout?tier=plus&period=monthly&trial=1&from=monologue_read");
    expect(o.monthlyLabel).toBe("or $12 month to month");
  });

  it("names the trial length from the server and the day money moves", () => {
    const week = plusOffer("monologue_search", trialWords(7), NOW);
    expect(week.cta).toBe("Start 1 week free");
    expect(week.rows).toEqual([
      ["Today", "$0"],
      ["November 7", "$99 for the year"],
    ]);
    expect(week.fine).toContain("Cancel before November 7");

    const fortnight = plusOffer("monologue_search", trialWords(14, true), NOW);
    expect(fortnight.cta).toBe("Start 2 weeks free");
    expect(fortnight.rows[1][0]).toBe("November 14");
  });

  it("promises no email before the charge", () => {
    const o = plusOffer("monologue_read", trialWords(7), NOW);
    expect(`${o.fine} ${o.rows.flat().join(" ")}`).not.toMatch(/email/i);
  });

  it("asks for the money straight after a taste, with no trial", () => {
    const o = plusOffer("monologue_read", trialWords(0, false, true, 7), NOW);
    expect(o.href).toContain("trial=0");
    expect(o.monthlyHref).toContain("trial=0");
    expect(o.rows).toEqual([["Today", "$99 for the year"]]);
    expect(o.cta).not.toMatch(/free/i);
  });

  it("carries no dashes", () => {
    const o = plusOffer("x", trialWords(7), NOW);
    const all = [o.cta, o.perMonthNote, o.fine, o.monthlyLabel, ...Object.values(PLUS_GAINS)].join(" ");
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("plusGains", () => {
  it("leads with what they ran into and keeps all four", () => {
    expect(plusGains("search")[0]).toBe(PLUS_GAINS.search);
    expect(new Set(plusGains("rehearse")).size).toBe(4);
  });
});

describe("chargeDate", () => {
  it("counts whole days forward", () => {
    expect(chargeDate(NOW, 7)).toBe("November 7");
  });
});
