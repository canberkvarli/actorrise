import { describe, expect, it } from "vitest";
import { beatUnits, anchorFor } from "./beatUnits";
import { monologueSegments } from "./monologueSegments";

describe("beatUnits", () => {
  it("splits prose with no segments into sentence units", () => {
    const text = "First sentence here. Second one follows it. And a third arrives.";
    const units = beatUnits(text, null);
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.index)).toEqual([0, 1, 2]);
    expect(units.every((u) => u.kind === "speech")).toBe(true);
  });

  it("agrees with monologueSegments when there are no text_segments", () => {
    const text = "I told him no. He kept asking anyway. So I left the room.";
    expect(beatUnits(text, null).map((u) => u.text)).toEqual(monologueSegments(text));
  });

  it("keeps a direction whole instead of splitting it", () => {
    const units = beatUnits("ignored", [
      { type: "direction", text: "She turns away. She does not look back." },
      { type: "speech", text: "You never listened to me. Not once in ten years." },
    ] as never);
    const directions = units.filter((u) => u.kind === "direction");
    expect(directions).toHaveLength(1);
    expect(directions[0].text).toBe("She turns away. She does not look back.");
    // ...while the speech beside it still breaks down.
    expect(units.filter((u) => u.kind === "speech")).toHaveLength(2);
  });

  it("numbers straight through the blocks", () => {
    const units = beatUnits("ignored", [
      { type: "speech", text: "One thing happens here. Then another thing follows." },
      { type: "direction", text: "A pause." },
      { type: "speech", text: "And then I spoke up. Loudly and without apology." },
    ] as never);
    expect(units.map((u) => u.index)).toEqual([0, 1, 2, 3, 4]);
    expect(units.map((u) => u.kind)).toEqual([
      "speech",
      "speech",
      "direction",
      "speech",
      "speech",
    ]);
  });

  it("marks where each block starts, so the reader can space them", () => {
    const units = beatUnits("ignored", [
      { type: "speech", text: "One thing happens here. Then another thing follows." },
      { type: "speech", text: "A new block begins here. It continues for some time." },
    ] as never);
    expect(units.map((u) => u.startsBlock)).toEqual([true, false, true, false]);
  });

  it("keeps an interjection's speaker", () => {
    const units = beatUnits("ignored", [
      { type: "interjection", text: "Don't.", speaker: "MARY" },
    ] as never);
    expect(units[0].kind).toBe("interjection");
    expect(units[0].speaker).toBe("MARY");
  });

  it("falls back to the text when segments hold nothing usable", () => {
    const text = "The only real line. And one more.";
    const units = beatUnits(text, [{ type: "speech", text: "  " }] as never);
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("The only real line.");
  });

  it("gives a single-block piece real lines rather than one", () => {
    // 10.9% of the corpus has exactly one text_segment. Anchoring to blocks
    // would leave those pieces with a single notable "line".
    const units = beatUnits("ignored", [
      {
        type: "speech",
        text: "I waited up for you. The light was on until three. You never called.",
      },
    ] as never);
    expect(units.length).toBeGreaterThan(1);
  });

  it("returns nothing for empty text", () => {
    expect(beatUnits("", null)).toEqual([]);
    expect(beatUnits(null, null)).toEqual([]);
  });
});

describe("anchorFor", () => {
  it("trims and caps at the column width the API stores", () => {
    expect(anchorFor("  hello there  ")).toBe("hello there");
    expect(anchorFor("x".repeat(400))).toHaveLength(120);
  });
});
