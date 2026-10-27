import { describe, expect, it } from "vitest";

import { groupShelf, matchesShelf, sortShelf, splitShelf } from "./shelfOrganize";

const s = (id: number, title: string, extra: Record<string, unknown> = {}) => ({ id, title, ...extra });

describe("splitShelf", () => {
  it("files own uploads, Community library copies and house copies apart", () => {
    const { own, community, house } = splitShelf([
      s(1, "Mine"),
      s(2, "From the library", { file_type: "shelf" }),
      s(3, "Older library copy", { original_filename: "shelf-12.txt" }),
      s(4, "Hamlet", { is_sample: true }),
    ]);
    expect(own.map((x) => x.id)).toEqual([1]);
    expect(community.map((x) => x.id)).toEqual([2, 3]);
    expect(house.map((x) => x.id)).toEqual([4]);
  });
});

describe("matchesShelf", () => {
  const script = s(1, "Good Will Hunting", {
    author: "Matt Damon",
    scene_titles: ["The park bench"],
    characters: [{ name: "SEAN" }],
  });
  it("finds a script by title, author, scene or character, ignoring case", () => {
    for (const q of ["good will", "damon", "PARK BENCH", "sean", "  "]) expect(matchesShelf(script, q)).toBe(true);
    expect(matchesShelf(script, "hamlet")).toBe(false);
  });
});

describe("sortShelf", () => {
  const list = [s(1, "beta", { created_at: "2026-01-02" }), s(2, "Alpha", { created_at: "2026-03-01" })];
  it("keeps the actor's order, or sorts by name or by newest", () => {
    expect(sortShelf(list, "mine").map((x) => x.id)).toEqual([1, 2]);
    expect(sortShelf(list, "az").map((x) => x.id)).toEqual([2, 1]);
    expect(sortShelf(list, "recent").map((x) => x.id)).toEqual([2, 1]);
  });
});

describe("groupShelf", () => {
  it("folds scripts with the same title into one entry, where the first one stood", () => {
    const entries = groupShelf([s(1, "Doubt"), s(2, "Good Will Hunting"), s(3, "doubt "), s(4, "Doubt")]);
    expect(entries.map((e) => (e.kind === "one" ? e.script.id : e.scripts.map((x) => x.id)))).toEqual([
      [1, 3, 4],
      2,
    ]);
  });
});
