import { describe, expect, it } from "vitest";

import { onboardingIsQuietOn } from "./onboarding-routes";

describe("onboardingIsQuietOn", () => {
  it("is quiet on the ScenePartner hub and inside it", () => {
    expect(onboardingIsQuietOn("/practice")).toBe(true);
    expect(onboardingIsQuietOn("/practice/")).toBe(true);
    expect(onboardingIsQuietOn("/practice/73/scenes/827")).toBe(true);
  });

  it("is quiet on a rehearsal", () => {
    expect(onboardingIsQuietOn("/scenes/937/rehearse")).toBe(true);
    expect(onboardingIsQuietOn("/scenes/937/rehearse?session=1&guided=1".split("?")[0])).toBe(true);
  });

  it("shows everywhere else, the library first of all", () => {
    expect(onboardingIsQuietOn("/monologues")).toBe(false);
    expect(onboardingIsQuietOn("/")).toBe(false);
    expect(onboardingIsQuietOn("/practices")).toBe(false);
    expect(onboardingIsQuietOn("/scenes/937")).toBe(false);
  });

  it("treats an unknown path as loud, so the curtain can never stick", () => {
    expect(onboardingIsQuietOn(null)).toBe(false);
    expect(onboardingIsQuietOn(undefined)).toBe(false);
  });
});
