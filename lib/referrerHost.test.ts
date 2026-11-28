import { describe, expect, it } from "vitest";
import { referrerHost } from "./referrerHost";

describe("referrerHost", () => {
  it("keeps another site's host and drops the path", () => {
    expect(referrerHost("https://www.google.com/search?q=hamlet", "ghostlight.actor")).toBe("google.com");
  });
  it("is null for our own site, with or without www", () => {
    expect(referrerHost("https://ghostlight.actor/monologues", "www.ghostlight.actor")).toBeNull();
  });
  it("is null for no referrer", () => {
    expect(referrerHost("", "ghostlight.actor")).toBeNull();
  });
});
