import { describe, expect, it } from "vitest";

import { describeCharacter, formatLength, shelfQuery, sourceLine } from "./shelf";

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
