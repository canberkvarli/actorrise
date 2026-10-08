import { describe, expect, it } from "vitest";

import { AUDITION_INTRO_KEY, markIntroSeen, readIntroSeen, shouldAutoShowIntro } from "./auditionIntro";

function memory() {
  const m = new Map<string, string>();
  return () => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
}

const throwing = () => {
  throw new Error("SecurityError");
};

describe("audition intro seen flag", () => {
  it("is unseen until marked", () => {
    const s = memory();
    expect(readIntroSeen(s)).toBe(false);
    markIntroSeen(s);
    expect(readIntroSeen(s)).toBe(true);
    expect(s().getItem(AUDITION_INTRO_KEY)).toBe("1");
  });

  it("reads as seen when storage throws, so it never nags", () => {
    expect(readIntroSeen(throwing)).toBe(true);
    expect(() => markIntroSeen(throwing)).not.toThrow();
  });

  it("reads as seen when getItem itself throws", () => {
    const s = () => ({ getItem: () => { throw new Error("x"); }, setItem: () => {} });
    expect(readIntroSeen(s)).toBe(true);
  });
});

describe("shouldAutoShowIntro", () => {
  const base = { loading: false, failed: false, count: 0, seen: false };
  it("shows on an empty, loaded, unseen rail", () => expect(shouldAutoShowIntro(base)).toBe(true));
  it("not while loading", () => expect(shouldAutoShowIntro({ ...base, loading: true })).toBe(false));
  it("not when the list failed", () => expect(shouldAutoShowIntro({ ...base, failed: true })).toBe(false));
  it("not with auditions on the rail", () => expect(shouldAutoShowIntro({ ...base, count: 2 })).toBe(false));
  it("not when they came to add one", () => expect(shouldAutoShowIntro({ ...base, adding: true })).toBe(false));
  it("not once seen", () => expect(shouldAutoShowIntro({ ...base, seen: true })).toBe(false));
});
