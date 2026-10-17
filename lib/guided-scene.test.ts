import { describe, expect, it } from "vitest";
import { guidedRoute, platformOf, titleCase } from "./guided-scene";

describe("guided scene helpers", () => {
  it("routes to the guided run", () => {
    expect(guidedRoute(937)).toBe("/scenes/937/rehearse?guided=1");
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
