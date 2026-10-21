import { describe, expect, it } from "vitest";
import { firstTakeEnd, FIRST_TAKE_MAX_LINES } from "./firstTake";

const line = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("firstTakeEnd", () => {
  it("runs a short piece whole", () => {
    expect(firstTakeEnd([line(10), line(10), line(10)])).toBe(3);
  });

  it("stops a long piece after the line cap", () => {
    const lines = Array.from({ length: 20 }, () => line(5));
    expect(firstTakeEnd(lines)).toBe(FIRST_TAKE_MAX_LINES);
  });

  it("stops a wordy piece at the word budget", () => {
    const lines = Array.from({ length: 20 }, () => line(30));
    // 30 + 30 = 60, a third would be 90 > 70
    expect(firstTakeEnd(lines)).toBe(2);
  });

  it("always holds at least two lines", () => {
    const lines = Array.from({ length: 20 }, () => line(100));
    expect(firstTakeEnd(lines)).toBe(2);
  });

  it("does not stop two lines short of the end", () => {
    const lines = Array.from({ length: FIRST_TAKE_MAX_LINES + 2 }, () => line(5));
    expect(firstTakeEnd(lines)).toBe(lines.length);
  });

  it("does stop three lines short of the end", () => {
    const lines = Array.from({ length: FIRST_TAKE_MAX_LINES + 3 }, () => line(5));
    expect(firstTakeEnd(lines)).toBe(FIRST_TAKE_MAX_LINES);
  });

  it("handles an empty piece", () => {
    expect(firstTakeEnd([])).toBe(0);
  });
});
