import { describe, it, expect } from "vitest";
import { VOICE_MARKS, voiceMark } from "./voiceMarks";
import { AI_VOICES } from "./scenePrefs";

describe("every voice has a mark", () => {
  it("covers the whole catalogue, so no row falls back", () => {
    for (const v of AI_VOICES) {
      expect(VOICE_MARKS[v.id], v.id).toBeDefined();
    }
  });

  it("has no mark for a voice that does not exist", () => {
    const ids = new Set(AI_VOICES.map((v) => v.id));
    for (const key of Object.keys(VOICE_MARKS)) {
      expect(ids.has(key), key).toBe(true);
    }
  });
});

describe("the marks are tellable apart", () => {
  it("no two voices draw the same shape", () => {
    const shapes = Object.values(VOICE_MARKS).map((m) => m.bars.join(","));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("stays in range, so nothing overflows the box", () => {
    for (const [id, m] of Object.entries(VOICE_MARKS)) {
      expect(m.bars.length, id).toBe(4);
      for (const b of m.bars) {
        expect(b, id).toBeGreaterThan(0);
        expect(b, id).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws the deep voice lower in the frame than the light one", () => {
    // The shape should follow the description, or it is decoration.
    const avg = (id: string) =>
      VOICE_MARKS[id].bars.reduce((a, b) => a + b, 0) / 4;
    expect(avg("onyx")).toBeGreaterThan(avg("ballad"));
    expect(VOICE_MARKS["alloy"].bars.every((b) => b === VOICE_MARKS["alloy"].bars[0])).toBe(true);
  });
});

describe("voiceMark", () => {
  it("is case-insensitive", () => {
    expect(voiceMark("CORAL")).toBe(VOICE_MARKS.coral);
  });

  it("falls back rather than returning nothing", () => {
    expect(voiceMark(null).bars.length).toBe(4);
    expect(voiceMark("nope").bars.length).toBe(4);
  });
});
