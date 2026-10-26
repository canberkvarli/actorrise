import { describe, expect, it } from "vitest";

import {
  contributorLine,
  describeCharacter,
  filterShelf,
  groupByWork,
  formatLength,
  guessWorkKind,
  shareMoment,
  shelfQuery,
  sourceLine,
  type ShareableScene,
  type ShelfScene,
} from "./shelf";

describe("shelf", () => {
  it("formats a length", () => {
    expect(formatLength(165)).toBe("2:45");
    expect(formatLength(60)).toBe("1:00");
    expect(formatLength(null)).toBe("");
  });

  it("describes a part briefly", () => {
    expect(describeCharacter({ name: "Nora", gender: "female", age: "30s" })).toBe("Nora (F, 30s)");
    expect(describeCharacter({ name: "Puck", gender: "any", age: "any" })).toBe("Puck");
  });

  it("builds the query without empty filters", () => {
    expect(shelfQuery({ pairing: "mf", q: "  " })).toBe("?pairing=mf");
    expect(shelfQuery({}, 30)).toBe("?offset=30");
    expect(shelfQuery({})).toBe("");
  });

  it("names the source", () => {
    expect(sourceLine({ work_title: "Hedda Gabler", author: "Henrik Ibsen", work_kind: "play", where: null }))
      .toBe("Hedda Gabler · Henrik Ibsen");
    expect(sourceLine({ work_title: "Fleabag", author: null, work_kind: "tv", where: "S1E3, the church" }))
      .toBe("Fleabag (TV) · S1E3, the church");
  });
});

const mine = (over: Partial<ShareableScene>): ShareableScene => ({
  scene_id: 1, script_id: 9, title: "The garden", script_title: "Doubt", script_author: null,
  where_guess: "", characters: [], duration_seconds: 120, line_count: 20, tone: null,
  description: null, already_shared: false, ask: null, shelf_id: null, open_count: 0, finished: false,
  ...over,
});

describe("shareMoment", () => {
  it("asks at upload about every scene nobody asked about", () => {
    const m = shareMoment([mine({ scene_id: 1 }), mine({ scene_id: 2, ask: "shared" }), mine({ scene_id: 3 })]);
    expect(m?.kind).toBe("upload");
    expect(m?.scenes.map((s) => s.scene_id)).toEqual([1, 3]);
  });
  it("nudges after a finished run only when they said not now at upload", () => {
    expect(shareMoment([mine({ ask: "declined" })])).toBeNull();
    expect(shareMoment([mine({ ask: "declined", finished: true })])?.kind).toBe("rehearsed");
    expect(shareMoment([mine({ ask: "done_asking", finished: true })])).toBeNull();
    expect(shareMoment([mine({ ask: "shared", finished: true })])).toBeNull();
  });
  it("is quiet with nothing to ask", () => {
    expect(shareMoment([])).toBeNull();
  });
});

describe("guessWorkKind", () => {
  it("reads an episode as TV and a slugline as film", () => {
    expect(guessWorkKind("Episode 6: Passion, Scene 4")).toBe("tv");
    expect(guessWorkKind("S1E3")).toBe("tv");
    expect(guessWorkKind("INT. KITCHEN - NIGHT")).toBe("film");
    expect(guessWorkKind("Act 2, Scene 3")).toBe("play");
  });
});

describe("contributorLine", () => {
  it("says nothing before a share and counts opens after", () => {
    expect(contributorLine(undefined)).toBeNull();
    expect(contributorLine({ contributor: false, opens: 0 })).toBeNull();
    expect(contributorLine({ contributor: true, opens: 0 })).toBe("Contributor");
    expect(contributorLine({ contributor: true, opens: 1 })).toBe("Contributor · 1 actor picked yours up");
    expect(contributorLine({ contributor: true, opens: 12 })).toBe("Contributor · 12 actors picked yours up");
  });
});

const scene = (over: Partial<ShelfScene>): ShelfScene => ({
  id: 1, kind: "public_domain", status: "live", title: "Nora waits", description: "She has the letter.",
  work_title: "A Doll's House", work_kind: "play", author: "Henrik Ibsen", year: 1879, era: "modern", where: null,
  characters: [{ name: "Nora", gender: "female", age: "30s" }, { name: "Helmer", gender: "male", age: "40s" }],
  duration_seconds: 150, line_count: 20, tone: "tense", open_count: 0, shared_by: null, is_mine: false, on_my_shelf: null,
  ...over,
});

describe("filterShelf", () => {
  const nora = scene({});
  const sisters = scene({ id: 2, title: "Masha and Olga", work_title: "Three Sisters", author: "Anton Chekhov",
    characters: [{ name: "Masha", gender: "female", age: "20s" }, { name: "Olga", gender: "female", age: "any" }],
    duration_seconds: 260, tone: "tragic", era: "modern" });
  const all = [nora, sisters];

  it("reads a pairing either way round, and 'any' fits both", () => {
    expect(filterShelf(all, { pairing: "mf" }).map((s) => s.id)).toEqual([1]);
    expect(filterShelf(all, { pairing: "ff" }).map((s) => s.id)).toEqual([2]);
    expect(filterShelf(all, { pairing: "mm" })).toEqual([]);
  });
  it("matches every word of a search anywhere on the card", () => {
    expect(filterShelf(all, { q: "ibsen letter" }).map((s) => s.id)).toEqual([1]);
    expect(filterShelf(all, { q: "OLGA" }).map((s) => s.id)).toEqual([2]);
    expect(filterShelf(all, { q: "ibsen olga" })).toEqual([]);
  });
  it("filters age, length and tone like the server", () => {
    expect(filterShelf(all, { age: "40s" }).map((s) => s.id)).toEqual([1, 2]); // Olga is any age
    expect(filterShelf(all, { length: "long" }).map((s) => s.id)).toEqual([2]);
    expect(filterShelf(all, { length: "medium" }).map((s) => s.id)).toEqual([1]);
    expect(filterShelf(all, { tone: "tragic" }).map((s) => s.id)).toEqual([2]);
  });
});

describe("groupByWork", () => {
  it("gathers a play's scenes under it, shared works first, then most opened, then by title", () => {
    const works = groupByWork([
      scene({ id: 1, work_title: "The Tempest", author: "William Shakespeare" }),
      scene({ id: 2, work_title: "Hamlet", author: "William Shakespeare" }),
      scene({ id: 3, work_title: "The Tempest", author: "William Shakespeare" }),
      scene({ id: 4, work_title: "Doubt", author: "John Patrick Shanley", kind: "shared" }),
      scene({ id: 5, work_title: "Arcadia", author: "Tom Stoppard", open_count: 4 }),
    ]);
    expect(works.map((w) => w.work_title)).toEqual(["Doubt", "Arcadia", "Hamlet", "The Tempest"]);
    expect(works[3].scenes.map((s) => s.id)).toEqual([1, 3]);
    expect(works[0].shared).toBe(true);
  });
});
