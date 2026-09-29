import { describe, expect, it } from "vitest";
import { paywallProps, surfaceOf } from "./paywall-events";

describe("surfaceOf", () => {
  it("names the room, not the row", () => {
    expect(surfaceOf("/monologue/812/work")).toBe("monologue");
    expect(surfaceOf("/scenes/4/rehearse")).toBe("scenes");
    expect(surfaceOf("/monologues")).toBe("monologues");
  });

  it("calls the root home", () => {
    expect(surfaceOf("/")).toBe("home");
    expect(surfaceOf("")).toBe("home");
  });
});

describe("paywallProps", () => {
  it("carries gate, kind, surface and tier", () => {
    expect(paywallProps("monologue_read", "wall", "free", "/monologues")).toEqual({
      gate: "monologue_read",
      kind: "wall",
      surface: "monologues",
      tier_current: "free",
    });
  });

  it("adds the variant when there is one", () => {
    const props = paywallProps("third_save", "ask", "free", "/monologues", "third_save_a");
    expect(props.variant).toBe("third_save_a");
  });

  it("leaves the variant key off when there is none", () => {
    expect("variant" in paywallProps("monologue_read", "wall", "free", "/")).toBe(false);
  });
});
