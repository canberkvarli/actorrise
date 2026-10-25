import { describe, expect, it } from "vitest";

import {
  contributorLine,
  describeCharacter,
  formatLength,
  guessWorkKind,
  shareMoment,
  shelfQuery,
  sourceLine,
  type ShareableScene,
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
    expect(contributorLine({ contributor: true, opens: 1 })).toBe("Contributor · 1 actor opened yours");
    expect(contributorLine({ contributor: true, opens: 12 })).toBe("Contributor · 12 actors opened yours");
  });
});
