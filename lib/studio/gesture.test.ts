import { describe as group, expect, it } from "vitest";

import { read } from "./effort";
import { NEUTRAL, cleanGesture, describe, effortOf, period, poseAt, progressAt, type GestureSpec } from "./gesture";
import { newRole } from "./notebook";
import { buildCues, hasPlaces } from "./places";

const g = (over: Partial<GestureSpec> = {}): GestureSpec => ({
  verb: "push",
  direction: "none",
  quality: "ease",
  tempo: "medium",
  staccato: false,
  ...over,
});

group("poseAt", () => {
  it("at size 0 the body is all but still: the gesture is inside", () => {
    const s = g({ verb: "smash" });
    for (const t of [0.2, 0.9, 1.6]) {
      const p = poseAt(s, t, 0);
      expect(p.lean).toBeCloseTo(NEUTRAL.lean, 5);
      expect(p.arms[0].raise).toBeCloseTo(NEUTRAL.arms[0].raise, 5);
    }
  });

  it("reaches the peak and comes back within a cycle", () => {
    const s = g({ verb: "lift" });
    const T = period(s);
    const ps = Array.from({ length: 60 }, (_, n) => progressAt(s, (n / 60) * T).p);
    expect(Math.max(...ps)).toBeCloseTo(1, 2);
    expect(ps[0]).toBeLessThan(0.05);
    expect(poseAt(s, T * 0.6, 1).arms[1].raise).toBeGreaterThan(2.5); // arms up at the hold
  });

  it("staccato gets to the peak sooner than legato", () => {
    const T = period(g());
    const early = T * 0.15;
    expect(progressAt(g({ staccato: true }), early).p).toBeGreaterThan(progressAt(g(), early).p);
  });
});

group("effortOf", () => {
  it("a quick, staccato smash with anger reads as punch", () => {
    expect(read(effortOf(g({ verb: "smash", quality: "anger", tempo: "quick", staccato: true }))).main.id).toBe("punch");
  });
  it("a slow, legato scatter with tenderness reads light and sustained", () => {
    const e = effortOf(g({ verb: "scatter", quality: "tenderness", tempo: "slow" }));
    expect(e.weight).toBeLessThan(0);
    expect(e.time).toBeLessThan(0);
  });
});

group("describe and clean", () => {
  it("says it plainly", () => {
    expect(describe(g({ direction: "forward", quality: "caution" }))).toBe("Push, forward, with caution");
  });
  it("drops an unknown verb and fixes the rest", () => {
    expect(cleanGesture({ verb: "moonwalk" })).toBeNull();
    expect(cleanGesture({ verb: "tear", quality: "?", tempo: "slow" })).toEqual(g({ verb: "tear", tempo: "slow" }));
  });
});

group("Places", () => {
  it("plays the role's gesture, and a gesture alone is enough to run Places", () => {
    const r = { ...newRole(), gesture: g({ verb: "embrace" }) };
    expect(hasPlaces(r)).toBe(true);
    expect(buildCues(r).map((c) => c.kind)).toEqual(["breath", "gesture", "go"]);
  });
});
