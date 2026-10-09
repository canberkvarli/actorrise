import { describe, it, expect } from "vitest";
import { rehearseStatus, type RehearseState } from "./rehearse-status";

const idle: RehearseState = {
  loadingVoice: false,
  partnerSpeaking: false,
  listening: false,
  processing: false,
  userTurn: false,
};

describe("the screen always says something, not just a colour", () => {
  it("every state produces visible words", () => {
    const states: RehearseState[] = [
      idle,
      { ...idle, loadingVoice: true },
      { ...idle, partnerSpeaking: true, partnerName: "Riley" },
      { ...idle, listening: true },
      { ...idle, listening: true, voiceHeard: true },
      { ...idle, processing: true },
      { ...idle, userTurn: true },
    ];
    for (const s of states) {
      const got = rehearseStatus(s);
      expect(got.text.length).toBeGreaterThan(0);
      expect(got.text.split(" ").length).toBeLessThanOrEqual(2);
      // Lowercase except where the line names the partner, which is a proper
      // noun and reads wrong folded down.
      if (!s.partnerSpeaking) expect(got.text).toBe(got.text.toLowerCase());
    }
  });
});

describe("whose turn it is", () => {
  it("names the partner when they have the line", () => {
    expect(rehearseStatus({ ...idle, partnerSpeaking: true, partnerName: "Riley" }).text)
      .toBe("Riley speaking");
  });

  it("falls back to 'partner' when the name is missing", () => {
    expect(rehearseStatus({ ...idle, partnerSpeaking: true }).text).toBe("partner speaking");
    expect(rehearseStatus({ ...idle, partnerSpeaking: true, partnerName: null }).text)
      .toBe("partner speaking");
  });

  it("distinguishes warming up from the partner actually speaking", () => {
    // Canberk read an amber dot as "Listen" while the voice was still being
    // generated. Two different amber states needed two different words.
    expect(rehearseStatus({ ...idle, loadingVoice: true }).text).toBe("warming up");
    expect(rehearseStatus({ ...idle, partnerSpeaking: true, partnerName: "Riley" }).text)
      .not.toBe("warming up");
  });
});

describe("while the actor speaks", () => {
  it("says their line is open before any sound", () => {
    expect(rehearseStatus({ ...idle, listening: true }).text).toBe("your line");
  });

  it("confirms sound is arriving, without claiming any words", () => {
    const got = rehearseStatus({ ...idle, listening: true, voiceHeard: true });
    expect(got.text).toBe("hearing you");
    // The one thing it must never do.
    expect(got.text).not.toMatch(/word|matched|\d/);
  });

  it("keeps the same colour whether or not a voice is heard, so it never flickers", () => {
    const quiet = rehearseStatus({ ...idle, listening: true });
    const loud = rehearseStatus({ ...idle, listening: true, voiceHeard: true });
    expect(quiet.color).toBe(loud.color);
  });
});

describe("precedence", () => {
  it("warming up beats everything", () => {
    expect(rehearseStatus({ ...idle, loadingVoice: true, listening: true }).text)
      .toBe("warming up");
  });

  it("the partner speaking beats listening", () => {
    expect(rehearseStatus({ ...idle, partnerSpeaking: true, listening: true, partnerName: "Riley" }).text)
      .toBe("Riley speaking");
  });

  it("idle reads as ready, never as an error", () => {
    expect(rehearseStatus(idle).text).toBe("ready");
    expect(rehearseStatus(idle).pulse).toBe(false);
  });
});

describe("one colour", () => {
  it("every state wears the same dot", () => {
    // Amber, blue, green, orange and grey was a legend to learn and then read
    // while acting. The word says what is happening; the dot only says that
    // something is.
    const states: RehearseState[] = [
      idle,
      { ...idle, loadingVoice: true },
      { ...idle, partnerSpeaking: true, partnerName: "Riley" },
      { ...idle, listening: true },
      { ...idle, listening: true, voiceHeard: true },
      { ...idle, processing: true },
      { ...idle, userTurn: true },
    ];
    const colours = new Set(states.map((s) => rehearseStatus(s).color));
    expect(colours.size).toBe(1);
  });
});
