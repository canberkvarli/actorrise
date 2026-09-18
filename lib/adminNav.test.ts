import { describe, expect, it } from "vitest";

import { ADMIN_NAV, BADGE_KEYS, isActive } from "./adminNav";

describe("isActive", () => {
  it("matches Overview only on an exact path", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/users", "/admin")).toBe(false);
  });

  it("matches a section on its prefix", () => {
    expect(isActive("/admin/searches", "/admin/searches")).toBe(true);
    expect(isActive("/admin/monologues/review", "/admin/monologues/review")).toBe(
      true
    );
  });

  it("does not light Search up when Requests is open", () => {
    expect(isActive("/admin/requests", "/admin/searches")).toBe(false);
    expect(isActive("/admin/requests", "/admin/requests")).toBe(true);
  });
});

describe("ADMIN_NAV", () => {
  const items = ADMIN_NAV.flatMap((g) => g.items);

  it("has a Requests entry with a badge", () => {
    const requests = items.find((i) => i.href === "/admin/requests");
    expect(requests).toBeDefined();
    expect(requests?.badgeKey).toBe("requests");
  });

  it("only uses badge keys the pulse endpoint returns", () => {
    for (const item of items) {
      if (item.badgeKey) expect(BADGE_KEYS).toContain(item.badgeKey);
    }
  });

  it("gives every item a unique href", () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
