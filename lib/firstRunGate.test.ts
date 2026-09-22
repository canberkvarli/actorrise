import { describe, expect, it } from "vitest";

import { gateMayFire } from "./firstRunGate";

describe("gateMayFire", () => {
  it("fires on the library shelf, which is what it is for", () => {
    expect(gateMayFire("/monologues")).toBe(true);
    expect(gateMayFire("/")).toBe(true);
  });

  it("does not hijack someone who opened ScenePartner", () => {
    // Observed 2026-09-23: /practice rendered, the gate fired a beat later, and
    // the actor landed on /monologue/45/work without touching anything.
    expect(gateMayFire("/practice")).toBe(false);
    expect(gateMayFire("/practice/115")).toBe(false);
    expect(gateMayFire("/practice/115/scenes/929")).toBe(false);
  });

  it("never interrupts a room already in progress", () => {
    expect(gateMayFire("/monologue/45/work")).toBe(false);
    expect(gateMayFire("/monologue/45/memorize")).toBe(false);
    expect(gateMayFire("/scenes/929/rehearse")).toBe(false);
  });

  it("stays out of checkout and auth", () => {
    expect(gateMayFire("/checkout")).toBe(false);
    expect(gateMayFire("/billing")).toBe(false);
    expect(gateMayFire("/auth/callback")).toBe(false);
  });

  it("never bounces off its own destination", () => {
    expect(gateMayFire("/first-scene")).toBe(false);
  });
});
