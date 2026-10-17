import { describe, expect, it } from "vitest";
import { PICKS_KEPT_KEY, noteOnboardingPicksKept, takeOnboardingPicksKept } from "./onboardingPicks";

function memory() {
  const m = new Map<string, string>();
  return () => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
}
const throwing = () => {
  throw new Error("SecurityError");
};

describe("onboarding picks kept flag", () => {
  it("is zero until noted, and read once", () => {
    const s = memory();
    expect(takeOnboardingPicksKept(s)).toBe(0);
    noteOnboardingPicksKept(6, s);
    expect(s().getItem(PICKS_KEPT_KEY)).toBe("6");
    expect(takeOnboardingPicksKept(s)).toBe(6);
    expect(takeOnboardingPicksKept(s)).toBe(0);
  });
  it("ignores zero and garbage", () => {
    const s = memory();
    noteOnboardingPicksKept(0, s);
    expect(s().getItem(PICKS_KEPT_KEY)).toBeNull();
    s().setItem(PICKS_KEPT_KEY, "six");
    expect(takeOnboardingPicksKept(s)).toBe(0);
  });
  it("survives a throwing storage", () => {
    expect(takeOnboardingPicksKept(throwing)).toBe(0);
    expect(() => noteOnboardingPicksKept(3, throwing)).not.toThrow();
  });
});
