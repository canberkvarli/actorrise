import { describe, expect, it } from "vitest";
import { BRAND, SITE_URL } from "./brand";

// Ghost Light at ghostlight.actor since 2026-11-16. Email stays on actorrise.com
// until it moves; the env still wins for previews and local runs.
describe("brand", () => {
  it("is Ghost Light", () => {
    expect(BRAND.name).toBe("Ghost Light");
    expect(BRAND.domain).toBe("ghostlight.actor");
    expect(BRAND.siteUrl).toBe("https://ghostlight.actor");
    expect(BRAND.email).toBe("canberk@actorrise.com");
    expect(SITE_URL).toBe(process.env.NEXT_PUBLIC_SITE_URL || "https://ghostlight.actor");
  });
});
