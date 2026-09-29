import { describe, expect, it } from "vitest";
import {
  canShow,
  EMPTY_STORE,
  parseStore,
  recordClick,
  recordDismiss,
  recordShow,
  type Store,
} from "./eligibility";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = 1_800_000_000_000;

describe("canShow", () => {
  it("shows a gate nobody has seen", () => {
    expect(canShow(EMPTY_STORE, "third_save", T0, 0)).toBe(true);
  });

  it("holds a gate for 24 hours after a show", () => {
    const s = recordShow(EMPTY_STORE, "third_save", T0);
    expect(canShow(s, "third_save", T0 + 23 * HOUR, 0)).toBe(false);
    expect(canShow(s, "third_save", T0 + 25 * HOUR, 0)).toBe(true);
  });

  it("does not let one gate silence another", () => {
    const s = recordShow(EMPTY_STORE, "third_save", T0);
    expect(canShow(s, "reads_meter", T0 + HOUR, 0)).toBe(true);
  });

  it("holds a dismissed gate for 7 days", () => {
    const s = recordDismiss(recordShow(EMPTY_STORE, "third_save", T0), "third_save", T0);
    expect(canShow(s, "third_save", T0 + 6 * DAY, 0)).toBe(false);
    expect(canShow(s, "third_save", T0 + 8 * DAY, 0)).toBe(true);
  });

  it("a dismissal of one gate leaves the others alone", () => {
    const s = recordDismiss(recordShow(EMPTY_STORE, "third_save", T0), "third_save", T0);
    expect(canShow(s, "scene_completed", T0 + HOUR, 1)).toBe(true);
  });

  it("stops a gate after 4 shows", () => {
    let s: Store = EMPTY_STORE;
    for (let i = 0; i < 4; i++) s = recordShow(s, "third_save", T0 + i * 2 * DAY);
    expect(canShow(s, "third_save", T0 + 30 * DAY, 0)).toBe(false);
    expect(canShow(s, "reads_meter", T0 + 30 * DAY, 0)).toBe(true);
  });

  it("goes quiet for the session after 3 dismissals", () => {
    expect(canShow(EMPTY_STORE, "third_save", T0, 2)).toBe(true);
    expect(canShow(EMPTY_STORE, "third_save", T0, 3)).toBe(false);
  });

  it("stops everything once they have clicked through", () => {
    expect(canShow(recordClick(EMPTY_STORE), "third_save", T0, 0)).toBe(false);
  });
});

describe("recordShow", () => {
  it("does not mutate the store it was given", () => {
    const before = recordShow(EMPTY_STORE, "third_save", T0);
    const after = recordShow(before, "third_save", T0 + 2 * DAY);
    expect(before.gates.third_save.shows).toBe(1);
    expect(after.gates.third_save.shows).toBe(2);
    expect(EMPTY_STORE.gates).toEqual({});
  });
});

describe("parseStore", () => {
  it("reads what it wrote", () => {
    const s = recordShow(EMPTY_STORE, "third_save", T0);
    expect(parseStore(JSON.stringify(s))).toEqual(s);
  });

  it("treats nothing, junk and the old single counter as empty", () => {
    expect(parseStore(null)).toEqual(EMPTY_STORE);
    expect(parseStore("{not json")).toEqual(EMPTY_STORE);
    expect(parseStore('"a string"')).toEqual(EMPTY_STORE);
    // The shape TrialOffer.tsx stored before 2026-09-29.
    const old = JSON.stringify({ shows: 4, lastShownAt: T0, quietUntil: 0, clicked: false });
    expect(parseStore(old)).toEqual(EMPTY_STORE);
  });

  it("drops a gate whose numbers are not numbers", () => {
    const raw = JSON.stringify({
      clicked: false,
      gates: {
        good: { shows: 1, lastShownAt: T0, quietUntil: 0 },
        bad: { shows: "lots", lastShownAt: null, quietUntil: 0 },
      },
    });
    expect(Object.keys(parseStore(raw).gates)).toEqual(["good"]);
  });
});
