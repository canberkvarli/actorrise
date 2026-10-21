import { describe, expect, it } from "vitest";
import { groupIntoThoughts, THOUGHT_MAX_WORDS } from "./runLines";
import { toDeliverableLines } from "./lineMatching";

describe("groupIntoThoughts", () => {
  it("gathers the fragments of a speech into thoughts", () => {
    const text =
      "My mom was Native American. She believed in spirit animals-- Don't laugh. It was her thing. Spirit animals. So stupid. Except for the wolf.";
    expect(groupIntoThoughts(toDeliverableLines(text))).toEqual([
      "My mom was Native American. She believed in spirit animals-- Don't laugh.",
      "It was her thing. Spirit animals. So stupid.",
      "Except for the wolf.",
    ]);
  });

  it("leaves a long sentence alone", () => {
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ") + ".";
    expect(groupIntoThoughts([long, "Short one."])).toEqual([long, "Short one."]);
  });

  it("never grows a line past the cap by taking a sentence", () => {
    const seven = "a b c d e f g.";
    const twenty = Array.from({ length: 20 }, () => "x").join(" ") + ".";
    const out = groupIntoThoughts([seven, twenty]);
    expect(out).toEqual([seven, twenty]);
    for (const line of out) expect(line.split(/\s+/).length).toBeLessThanOrEqual(THOUGHT_MAX_WORDS);
  });

  it("keeps the words in order and loses none", () => {
    const sentences = ["One.", "Two two.", "Three three three.", "Four.", "Five five five five five five five five five."];
    expect(groupIntoThoughts(sentences).join(" ")).toBe(sentences.join(" "));
  });

  it("handles nothing", () => {
    expect(groupIntoThoughts([])).toEqual([]);
    expect(groupIntoThoughts(["  "])).toEqual([]);
  });
});
