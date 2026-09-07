import { describe, expect, it } from "vitest";
import { benchState, pickCurrent, leadName } from "./collectionMeta";
import type { Monologue } from "@/types/actor";

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function piece(over: Partial<Monologue> & { id: number }): Monologue {
  return { title: "", character_name: "", text: "", ...over } as Monologue;
}

describe("pickCurrent", () => {
  it("returns null for an empty collection", () => {
    expect(pickCurrent([])).toBeNull();
  });

  it("gives the bench to the only piece", () => {
    // 46% of actors hold exactly one — this is the common case, not an edge.
    const only = piece({ id: 1, saved_at: iso(30) });
    expect(pickCurrent([only])?.id).toBe(1);
  });

  it("prefers a piece studied recently over one saved long ago", () => {
    const list = [
      piece({ id: 1, saved_at: iso(40), last_studied_at: iso(1) }),
      piece({ id: 2, saved_at: iso(30) }),
    ];
    expect(pickCurrent(list)?.id).toBe(1);
  });

  it("prefers a piece just saved over one studied weeks ago", () => {
    // The reason the rule is max(studied, saved) and not studied-alone.
    const list = [
      piece({ id: 1, saved_at: iso(60), last_studied_at: iso(21) }),
      piece({ id: 2, saved_at: iso(0) }),
    ];
    expect(pickCurrent(list)?.id).toBe(2);
  });

  it("still picks something when nothing has been studied", () => {
    // 81% of live rows have no study signal at all.
    const list = [
      piece({ id: 1, saved_at: iso(9) }),
      piece({ id: 2, saved_at: iso(2) }),
      piece({ id: 3, saved_at: iso(14) }),
    ];
    expect(pickCurrent(list)?.id).toBe(2);
  });

  it("falls back to the server's order when no timestamps came through", () => {
    // An older cached payload predating saved_at must not blank the bench.
    const list = [piece({ id: 7 }), piece({ id: 8 })];
    expect(pickCurrent(list)?.id).toBe(7);
  });
});

describe("benchState", () => {
  it("a never-run piece is on the bench", () => {
    const s = benchState(piece({ id: 1, saved_at: iso(1) }));
    expect(s.key).toBe("fresh");
    expect(s.primary.label).toBe("Start it");
  });

  it("a piece that has been run is in progress", () => {
    const s = benchState(piece({ id: 1, last_studied_at: iso(2) }));
    expect(s.key).toBe("in-progress");
    expect(s.primary.label).toBe("Run it again");
  });

  it("a memorized piece run recently is off book", () => {
    const s = benchState(piece({ id: 1, memorized: true, last_studied_at: iso(2) }));
    expect(s.key).toBe("off-book");
    expect(s.primary.label).toBe("Run it");
  });

  it("a memorized piece left a week goes cold", () => {
    const s = benchState(piece({ id: 1, memorized: true, last_studied_at: iso(9) }));
    expect(s.key).toBe("cold");
    expect(s.primary.label).toBe("Warm it up");
  });

  it("counts memorized-but-never-studied as cold, not off book", () => {
    // Marking off book without ever running it is exactly the piece that
    // needs warming, so a null last_studied_at must not read as fresh.
    const s = benchState(piece({ id: 1, memorized: true }));
    expect(s.key).toBe("cold");
  });

  it("always routes the primary action at the rehearsal room", () => {
    for (const p of [
      piece({ id: 5 }),
      piece({ id: 5, last_studied_at: iso(1) }),
      piece({ id: 5, memorized: true, last_studied_at: iso(1) }),
      piece({ id: 5, memorized: true, last_studied_at: iso(30) }),
    ]) {
      expect(benchState(p).primary.href(5)).toBe("/monologue/5/work");
    }
  });
});

describe("leadName", () => {
  it("leads with the character", () => {
    expect(leadName(piece({ id: 1, character_name: "Bee", title: "Bee's speech" }))).toBe("Bee");
  });

  it("falls back to the title when there is no character", () => {
    expect(leadName(piece({ id: 1, character_name: "", title: "A speech" }))).toBe("A speech");
  });
});
