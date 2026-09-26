import { describe, expect, it } from "vitest";

import { COACH_TEXT, NUDGE_AFTER_MS, coachState, type CoachInput } from "./guided-coach";

const base: CoachInput = {
  partnerSpeaking: false,
  micOpen: false,
  linesHeard: 0,
  msSinceMicOpened: 0,
  voicedThisTake: false,
  tapMode: false,
};

describe("coachState", () => {
  it("says listen while the partner opens the scene", () => {
    expect(coachState("quiet", { ...base, partnerSpeaking: true })).toBe("listen");
  });

  it("says your line when the mic opens for the first line", () => {
    expect(coachState("listen", { ...base, micOpen: true })).toBe("your_line");
  });

  it("says that's it exactly once, while the partner answers the first line", () => {
    expect(coachState("your_line", { ...base, partnerSpeaking: true, linesHeard: 1 })).toBe("heard_first");
    expect(coachState("heard_first", { ...base, partnerSpeaking: true, linesHeard: 2 })).toBe("quiet");
  });

  it("goes quiet on the second and later lines", () => {
    expect(coachState("heard_first", { ...base, micOpen: true, linesHeard: 1 })).toBe("quiet");
    expect(coachState("quiet", { ...base, micOpen: true, linesHeard: 2 })).toBe("quiet");
  });

  it("nudges after six quiet seconds with the mic open", () => {
    expect(coachState("your_line", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS })).toBe("nudge");
    expect(
      coachState("quiet", { ...base, micOpen: true, linesHeard: 2, msSinceMicOpened: NUDGE_AFTER_MS + 1 }),
    ).toBe("nudge");
  });

  it("does not nudge someone who is speaking", () => {
    expect(
      coachState("your_line", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS, voicedThisTake: true }),
    ).toBe("your_line");
  });

  it("never nudges while partner audio plays", () => {
    expect(coachState("your_line", { ...base, partnerSpeaking: true, msSinceMicOpened: NUDGE_AFTER_MS * 2 })).toBe(
      "listen",
    );
  });

  it("tap mode overrides everything", () => {
    expect(coachState("listen", { ...base, partnerSpeaking: true, tapMode: true })).toBe("tap_mode");
    expect(coachState("nudge", { ...base, micOpen: true, msSinceMicOpened: NUDGE_AFTER_MS, tapMode: true })).toBe(
      "tap_mode",
    );
  });

  it("holds the previous state between beats", () => {
    // Neither speaking nor listening: the transcript is being processed.
    expect(coachState("your_line", base)).toBe("your_line");
  });

  it("has a line of house text for every state, and none for quiet", () => {
    expect(COACH_TEXT.quiet).toBe("");
    for (const state of ["listen", "your_line", "heard_first", "nudge", "tap_mode"] as const) {
      expect(COACH_TEXT[state].length).toBeGreaterThan(0);
    }
  });
});
