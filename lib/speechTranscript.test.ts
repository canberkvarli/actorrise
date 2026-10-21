import { describe, expect, it } from "vitest";
import { sinceReset, wordsFromResults } from "./speechTranscript";

const list = (...texts: string[]) => texts.map((t) => [{ transcript: t }]);

describe("speech transcript", () => {
  it("reads every result, not just the newest", () => {
    expect(wordsFromResults(list("my mom was", " native american"))).toEqual([
      "my", "mom", "was", "native", "american",
    ]);
  });

  it("drops the finished line after a reset even when Safari sends it again", () => {
    // Safari: one growing result carrying the whole session.
    const atReset = wordsFromResults(list("my mom was native american"));
    const mark = atReset.length;
    const next = wordsFromResults(list("my mom was native american it was her thing"));
    expect(sinceReset(next, mark)).toBe("it was her thing");
  });

  it("is empty right after a reset", () => {
    const words = wordsFromResults(list("so stupid"));
    expect(sinceReset(words, words.length)).toBe("");
  });

  it("copes with a revision that shortens the past", () => {
    expect(sinceReset(["so"], 2)).toBe("");
  });
});
