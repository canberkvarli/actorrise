import { describe, expect, it } from "vitest";
import { shouldFetchPicks, type OnboardingAnswers } from "./onboardingFilters";

const base: OnboardingAnswers = { casting: null, ageRange: null, workOn: [], mediums: [], stage: null };

describe("shouldFetchPicks", () => {
  it("needs casting or age", () => {
    expect(shouldFetchPicks(base)).toBe(false);
    expect(shouldFetchPicks({ ...base, casting: "Female" })).toBe(true);
    expect(shouldFetchPicks({ ...base, ageRange: "20-29" })).toBe(true);
    expect(shouldFetchPicks({ ...base, workOn: ["comedic"], stage: "working_pro" })).toBe(false);
  });
});
