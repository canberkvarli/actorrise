import { describe, expect, it } from "vitest";
import { BRAND, SITE_URL } from "./brand";

// Until the switch to Ghost Light, the brand must read exactly as the
// hardcoded values it replaced.
describe("brand", () => {
  it("matches what was hardcoded", () => {
    expect(BRAND.name).toBe("ActorRise");
    expect(BRAND.domain).toBe("actorrise.com");
    expect(BRAND.siteUrl).toBe("https://www.actorrise.com");
    expect(SITE_URL).toBe(process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com");
  });
});
