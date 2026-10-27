import { describe, expect, it } from "vitest";
import { COLLECTIONS, collectionsForPiece } from "./monologueCollections";

const piece = {
  id: -1,
  playTitle: null,
  gender: "female",
  tone: "romantic",
  era: "contemporary",
  ageRange: "teens",
  durationSeconds: 75,
  sourceType: "play",
  themes: ["love"],
};

describe("collections", () => {
  it("keeps slugs unique and related links pointing at real shelves", () => {
    const slugs = COLLECTIONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COLLECTIONS) for (const r of c.related) expect(slugs).toContain(r);
  });

  it("holds every hand-picked shelf to unique ids and a turn line on each", () => {
    for (const c of COLLECTIONS.filter((c) => c.picks)) {
      const ids = c.picks!.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of c.picks!) expect(p.turn.trim()).toMatch(/^Turns when /);
    }
  });

  it("puts a picked piece on its hand-picked shelf first, and keeps everyone else off it", () => {
    for (const c of COLLECTIONS.filter((c) => c.picks)) {
      expect(collectionsForPiece({ ...piece, id: c.picks![0].id })[0]).toBe(c);
      expect(collectionsForPiece(piece, 50)).not.toContain(c);
    }
  });
});
