import { describe, expect, it } from "vitest";
import { cap, tasteDays, trialWords, plusHref } from "./trial";

describe("trialWords", () => {
  it("a week", () => {
    const w = trialWords(7);
    expect(w.cta).toBe("Start 1 week free");
    expect(w.short).toBe("1 week free");
    expect(w.span).toBe("a week");
    expect(w.days).toBe(7);
    expect(w.earned).toBe(false);
  });

  it("two weeks", () => {
    const w = trialWords(14, true);
    expect(w.cta).toBe("Start 2 weeks free");
    expect(w.short).toBe("2 weeks free");
    expect(w.span).toBe("two weeks");
    expect(w.earned).toBe(true);
  });

  it("falls back to a week while /me has not loaded", () => {
    expect(trialWords(undefined).days).toBe(7);
    expect(trialWords(0).days).toBe(7);
  });

  it("says days for any other length", () => {
    const w = trialWords(10);
    expect(w.cta).toBe("Start 10 days free");
    expect(w.span).toBe("10 days");
  });
});

describe("cap", () => {
  it("opens a sentence", () => {
    expect(cap("a week")).toBe("A week");
    expect(cap("two weeks")).toBe("Two weeks");
    expect(cap("")).toBe("");
  });
});

describe("after the three-day taste", () => {
  it("offers no trial and names the price", () => {
    const w = trialWords(0, false, true);
    expect(w.tasted).toBe(true);
    expect(w.cta).toBe("Keep Plus");
    expect(w.short).not.toMatch(/free/i);
    expect(w.terms).toMatch(/\$12 a month or \$99 a year/);
  });

  it("leaves the untasted words alone", () => {
    const w = trialWords(7);
    expect(w.tasted).toBe(false);
    expect(w.cta).toBe("Start 1 week free");
    expect(w.terms).toBe("Card on file, cancel before it renews.");
  });

  it("drops the trial from the checkout link once tasted", () => {
    expect(plusHref("monologue_read", true)).toBe(
      "/checkout?tier=plus&period=monthly&trial=0&from=monologue_read",
    );
    expect(plusHref("monologue_read", false)).toContain("trial=1");
  });
});

describe("when the free Plus ends", () => {
  it("says what they had, at the length it ran", () => {
    expect(trialWords(0, false, true, 7).overTitle).toBe("Your week of Plus ended.");
    expect(trialWords(0, false, true, 3).overTitle).toBe("Your 3 days of Plus ended.");
    expect(trialWords(0, false, true, null).overTitle).toBe("Your free Plus ended.");
    expect(trialWords(0, false, true, 7).overBody).toMatch(/every piece/);
  });

  it("reads the length off /me, never assumes it", () => {
    expect(tasteDays({ had: true, active: false, ends_at: null, days: 7 })).toBe(7);
    expect(tasteDays({ had: true, active: false, ends_at: null })).toBeNull();
    expect(tasteDays(null)).toBeNull();
  });

  it("says nothing about it before a taste", () => {
    expect(trialWords(7).overTitle).toBe("");
  });
});
