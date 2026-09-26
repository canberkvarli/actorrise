import { describe, expect, it } from "vitest";

import { shouldInvite } from "./guided-invite";

const fresh = { has_ever_rehearsed: false, has_seen_first_rehearsal: false };

describe("shouldInvite", () => {
  it("invites a signed-in actor who has never rehearsed and owns nothing", () => {
    expect(shouldInvite(fresh, 0, false)).toBe(true);
  });

  it("never invites the demo account", () => {
    expect(shouldInvite(fresh, 0, true)).toBe(false);
  });

  it("stops once they have rehearsed anything", () => {
    expect(shouldInvite({ ...fresh, has_ever_rehearsed: true }, 0, false)).toBe(false);
  });

  it("stops once the guided scene has been started, even if never finished", () => {
    // has_ever_rehearsed comes from the meter the guided endpoint skips, so
    // this flag is the only thing that remembers a started guided run.
    expect(shouldInvite({ ...fresh, has_seen_first_rehearsal: true }, 0, false)).toBe(false);
  });

  it("does not invite someone who brought their own script", () => {
    expect(shouldInvite(fresh, 1, false)).toBe(false);
  });

  it("does not guess when the user is unknown or the flags are missing", () => {
    expect(shouldInvite(null, 0, false)).toBe(false);
    expect(shouldInvite(undefined, 0, false)).toBe(false);
    expect(shouldInvite({}, 0, false)).toBe(false);
  });
});
