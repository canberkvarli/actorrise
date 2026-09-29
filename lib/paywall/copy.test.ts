import { describe, expect, it } from "vitest";
import { GATE_COPY, readsLeftLine } from "./copy";

describe("GATE_COPY", () => {
  const entries = Object.entries(GATE_COPY);

  it("has no dashes", () => {
    for (const [gate, c] of entries) {
      expect(`${c.headline} ${c.body}`, gate).not.toMatch(/[‒–—―]| - /);
    }
  });

  it("speaks as one person", () => {
    for (const [gate, c] of entries) {
      expect(`${c.headline} ${c.body}`, gate).not.toMatch(/\b(we|our|us)\b/i);
    }
  });

  it("names no trial length, which is the server's to say", () => {
    for (const [gate, c] of entries) {
      expect(`${c.headline} ${c.body}`, gate).not.toMatch(/week|days/i);
    }
  });

  it("gives every gate a variant id that starts with its own name", () => {
    for (const [gate, c] of entries) {
      expect(c.variant, gate).toMatch(new RegExp(`^${gate}_[a-z]$`));
    }
  });
});

describe("readsLeftLine", () => {
  it("counts", () => {
    expect(readsLeftLine(2)).toBe("2 free reads left this month. Plus opens every piece.");
  });

  it("knows one from many", () => {
    expect(readsLeftLine(1)).toBe("1 free read left this month. Plus opens every piece.");
  });
});
