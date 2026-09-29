import { describe, expect, it } from "vitest";
import { cap, trialWords } from "./trial";

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
