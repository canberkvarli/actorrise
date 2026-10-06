import { describe, it, expect } from "vitest";
import { characterHue, castPalette, hueIn, castColorVars, castInitial } from "./castColors";

describe("one character, one colour", () => {
  it("is stable for the same name", () => {
    expect(characterHue("HORATIO")).toBe(characterHue("HORATIO"));
  });

  it("ignores case and punctuation, which one script mixes freely", () => {
    // An extracted script writes the same man three ways on one page.
    const a = characterHue("MARCELLUS");
    expect(characterHue("Marcellus")).toBe(a);
    expect(characterHue("Marcellus.")).toBe(a);
    expect(characterHue("  marcellus  ")).toBe(a);
  });

  it("separates the characters of a real scene", () => {
    // Hashing alone collided here: two of these four came out identical,
    // which reads as "these are the same person".
    const cast = ["HORATIO", "MARCELLUS", "FRANCISCO", "BARNARDO"];
    const palette = castPalette(cast);
    const hues = new Set(cast.map((c) => hueIn(palette, c)));
    expect(hues.size).toBe(cast.length);
  });

  it("gives one character one colour however the script spells them", () => {
    const palette = castPalette(["MARCELLUS", "Marcellus.", "HORATIO"]);
    expect(palette.size).toBe(2);
    expect(hueIn(palette, "Marcellus")).toBe(hueIn(palette, "MARCELLUS."));
  });

  it("deals the palette in order of appearance", () => {
    const first = castPalette(["A", "B"]);
    const flipped = castPalette(["B", "A"]);
    expect(hueIn(first, "A")).toBe(hueIn(flipped, "B"));
  });

  it("falls back to the hash when the scene cast is unknown", () => {
    expect(hueIn(null, "HORATIO")).toBe(characterHue("HORATIO"));
  });

  it("never returns the accent hue, which means 'you' elsewhere", () => {
    const names = ["A", "B", "C", "HAMLET", "OPHELIA", "RILEY", "ALEX", "X", "Y", "Z"];
    for (const n of names) {
      const h = characterHue(n);
      expect(h < 20 || h > 60).toBe(true);
    }
  });

  it("survives an empty or symbol-only name instead of throwing", () => {
    expect(typeof characterHue("")).toBe("number");
    expect(typeof characterHue("???")).toBe("number");
  });
});

describe("castColorVars", () => {
  it("gives ink and a wash on the same hue", () => {
    const v = castColorVars("HORATIO");
    const h = characterHue("HORATIO");
    expect(v["--cast-ink"]).toContain(String(h));
    expect(v["--cast-wash"]).toContain(String(h));
    expect(v["--cast-wash"]).toContain("/ 0.12");
  });
});

describe("castInitial", () => {
  it("takes the first letter", () => {
    expect(castInitial("HORATIO")).toBe("H");
    expect(castInitial("teen jackie")).toBe("T");
  });

  it("skips punctuation to find one", () => {
    expect(castInitial("(a voice)")).toBe("A");
  });

  it("falls back rather than rendering an empty chip", () => {
    expect(castInitial("")).toBe("?");
    expect(castInitial("—")).toBe("?");
  });
});
