import { describe, expect, it } from "vitest";

import { onboardingIsQuietOn } from "./onboarding-routes";

describe("onboardingIsQuietOn", () => {
  it("is quiet on a rehearsal", () => {
    expect(onboardingIsQuietOn("/scenes/937/rehearse")).toBe(true);
    expect(onboardingIsQuietOn("/scenes/937/rehearse/")).toBe(true);
    expect(onboardingIsQuietOn("/scenes/937/rehearse?session=1&guided=1".split("?")[0])).toBe(true);
  });

  it("shows on the ScenePartner hub, which is where a new account lands", () => {
    expect(onboardingIsQuietOn("/practice")).toBe(false);
    expect(onboardingIsQuietOn("/practice/")).toBe(false);
    expect(onboardingIsQuietOn("/practice/73/scenes/827")).toBe(false);
  });

  it("shows everywhere else", () => {
    expect(onboardingIsQuietOn("/monologues")).toBe(false);
    expect(onboardingIsQuietOn("/rehearse")).toBe(false);
    expect(onboardingIsQuietOn("/")).toBe(false);
    expect(onboardingIsQuietOn("/scenes/937")).toBe(false);
    expect(onboardingIsQuietOn("/scenes/937/rehearsed")).toBe(false);
  });

  it("treats an unknown path as loud, so the curtain can never stick", () => {
    expect(onboardingIsQuietOn(null)).toBe(false);
    expect(onboardingIsQuietOn(undefined)).toBe(false);
  });
});
