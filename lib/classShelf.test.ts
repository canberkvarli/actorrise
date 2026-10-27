import { describe, expect, it } from "vitest";

import { filterShelf } from "./classShelf";

const scene = (title: string, a: string, b: string) => ({ title, character_1_name: a, character_2_name: b });
const shelf = [
  { title: "Diner, night", scenes: [scene("Diner, night", "MARK", "SARAH")] },
  { title: "Doubt", scenes: [scene("The garden", "Flynn", "Aloysius"), scene("The office", "Aloysius", "James")] },
];

describe("filterShelf", () => {
  it("keeps everything for an empty query", () => {
    expect(filterShelf(shelf, "  ")).toBe(shelf);
  });

  it("matches a script title, a scene title or a character, ignoring case", () => {
    expect(filterShelf(shelf, "diner").map((s) => s.title)).toEqual(["Diner, night"]);
    expect(filterShelf(shelf, "GARDEN").map((s) => s.title)).toEqual(["Doubt"]);
    expect(filterShelf(shelf, "sarah").map((s) => s.title)).toEqual(["Diner, night"]);
  });

  it("finds nothing when nothing matches", () => {
    expect(filterShelf(shelf, "hamlet")).toEqual([]);
  });
});
