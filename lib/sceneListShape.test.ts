import { describe, expect, it } from "vitest";

import { sceneListShape } from "./sceneListShape";

const scene = (id: number, act: string | null = null) => ({ id, act });

describe("sceneListShape", () => {
  it("calls a single scene solo", () => {
    // 11 of 20 scripts hold exactly one scene. A numbered list of one asks the
    // actor to choose between a thing and nothing.
    expect(sceneListShape([scene(1)])).toBe("solo");
  });

  it("calls a single scene solo even when it carries an act", () => {
    expect(sceneListShape([scene(1, "Act 1")])).toBe("solo");
  });

  it("calls several scenes without acts a list", () => {
    expect(sceneListShape([scene(1), scene(2), scene(3)])).toBe("list");
  });

  it("calls several scenes across acts grouped", () => {
    expect(sceneListShape([scene(1, "Act 1"), scene(2, "Act 1"), scene(3, "Act 2")]))
      .toBe("grouped");
  });

  it("does not group when every scene is in the SAME act", () => {
    // "Act 1 (4 scenes)" above the only act is a heading for nothing.
    expect(sceneListShape([scene(1, "Act 1"), scene(2, "Act 1")])).toBe("list");
  });

  it("treats a missing act as no act rather than its own group", () => {
    expect(sceneListShape([scene(1, "Act 1"), scene(2, null)])).toBe("grouped");
  });

  it("has nothing to draw for an empty script", () => {
    expect(sceneListShape([])).toBe("empty");
  });
});
