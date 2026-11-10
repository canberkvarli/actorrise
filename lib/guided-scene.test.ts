import { describe, expect, it } from "vitest";
import { guidedRoute, openingPart, platformOf, titleCase, type GuidedChoice } from "./guided-scene";

const fight = (opens?: string | null): GuidedChoice => ({
  key: "fight",
  scene_id: 41,
  title: "A fight",
  hook: null,
  opens,
  characters: [
    { name: "SAM", line: "the one who is done explaining", first_line: 1 },
    { name: "JO", line: "the one who leads", first_line: 0 },
  ],
});

describe("guided scene helpers", () => {
  it("offers the part that speaks first, as the server names it", () => {
    expect(openingPart(fight("JO"))?.name).toBe("JO");
  });
  it("falls back to the first listed part from a server that names none", () => {
    expect(openingPart(fight())?.name).toBe("SAM");
    expect(openingPart({ ...fight(), characters: [] })).toBeNull();
  });
  it("routes to the guided run", () => {
    expect(guidedRoute(937)).toBe("/scenes/937/rehearse?guided=1");
  });
  it("carries the part and the door for a keyed scene", () => {
    expect(guidedRoute(41, { as: "JO", from: "hub" })).toBe("/scenes/41/rehearse?guided=1&as=JO&from=hub");
  });
  it("names the platform from the user agent", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Macintosh)")).toBe("desktop");
  });
  it("title-cases a cue name", () => {
    expect(titleCase("RILEY")).toBe("Riley");
  });
});
