import { describe, it, expect } from "vitest";
import { monologueSegments, applyCut } from "./monologueSegments";

/**
 * Cut, Export and Memorize all index into monologueSegments(). If it returns a
 * different list than it did when a cut was saved, the cut silently points at
 * the wrong lines — so the shapes it returns matter more than they look.
 */

// The real Broadcast News speech: two prose paragraphs, separated by a blank
// line. This is the case that defeated the first fix.
const PROSE_WITH_PARAGRAPH =
  "We'd gone out twice and I hadn't enjoyed myself that much, but it gets to a point—I don't know if you can appreciate this—where you don't want to sit home. I'm not. It's just you want to meet a nice guy. So anyways, it was that thing. No, it wasn't. I was lonely.\n\nI promised myself I wouldn't cry... It's just hard not to—You sure have a sympathetic face.";

const VERSE = [
  "To be, or not to be, that is the question:",
  "Whether 'tis nobler in the mind to suffer",
  "The slings and arrows of outrageous fortune,",
  "Or to take arms against a sea of troubles",
  "And by opposing end them. To die—to sleep,",
].join("\n");

describe("monologueSegments", () => {
  it("splits single-paragraph prose into sentences, not one chunk", () => {
    const segs = monologueSegments("First sentence here. Second sentence here. Third one here.");
    expect(segs.length).toBeGreaterThan(1);
  });

  it("treats paragraphed prose as prose, not as verse", () => {
    // The bug: a blank line made a two-line "lineated" text, so this came back
    // as 2 enormous chunks and cutting was impossible again.
    const segs = monologueSegments(PROSE_WITH_PARAGRAPH);
    expect(segs.length).toBeGreaterThan(4);
    expect(segs.every((s) => s.length < 300)).toBe(true);
  });

  it("keeps verse lines intact", () => {
    expect(monologueSegments(VERSE)).toHaveLength(5);
    expect(monologueSegments(VERSE)[0]).toBe("To be, or not to be, that is the question:");
  });

  it("does not strand a one- or two-word sentence as its own line", () => {
    const segs = monologueSegments("I was lonely and tired. Please. That is the whole of it here.");
    expect(segs.every((s) => s.split(/\s+/).filter(Boolean).length > 2)).toBe(true);
  });

  it("keeps ordinary short sentences as separate cut points", () => {
    // Guards the threshold: at 3 words this collapsed to a single block and
    // the piece became un-cuttable again.
    expect(monologueSegments("First sentence here. Second sentence here. Third one here.").length)
      .toBe(3);
  });

  it("returns nothing for empty input", () => {
    expect(monologueSegments("")).toEqual([]);
    expect(monologueSegments(null)).toEqual([]);
  });

  it("drops blank lines so indices stay stable", () => {
    const segs = monologueSegments("Line one here now.\n\n\nLine two here now.\nLine three here.\nLine four here.");
    expect(segs.every((s) => s.trim().length > 0)).toBe(true);
  });
});

describe("applyCut", () => {
  it("returns the whole piece when no cut is set", () => {
    expect(applyCut(VERSE, null, null)).toBe(VERSE);
  });

  it("slices the chosen range inclusively", () => {
    expect(applyCut(VERSE, 1, 2)).toBe(
      "Whether 'tis nobler in the mind to suffer\nThe slings and arrows of outrageous fortune,",
    );
  });

  it("tolerates reversed endpoints", () => {
    expect(applyCut(VERSE, 2, 1)).toBe(applyCut(VERSE, 1, 2));
  });

  it("clamps an end index past the last segment", () => {
    // A cut saved under the old "\n"-only splitting can carry an index that no
    // longer exists. Clamping beats throwing or returning empty.
    expect(applyCut(VERSE, 3, 999)).toContain("Or to take arms");
  });

  it("joins prose with a space, not a newline", () => {
    const out = applyCut(PROSE_WITH_PARAGRAPH, 0, 1);
    expect(out).not.toContain("\n");
  });
});
