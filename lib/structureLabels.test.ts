import { describe, expect, it } from "vitest";
import { localizeStructure } from "./structureLabels";

describe("localizeStructure", () => {
  it("names the parser's labels in Turkish", () => {
    expect(localizeStructure("Act 1", "act", "tr")).toBe("1. Perde");
    expect(localizeStructure("Act III", "act", "tr")).toBe("3. Perde");
    expect(localizeStructure("act 2.", "act", "tr")).toBe("2. Perde");
    expect(localizeStructure("Scene 2", "scene", "tr")).toBe("2. Sahne");
    expect(localizeStructure("Scene iv", "scene", "tr")).toBe("4. Sahne");
    expect(localizeStructure("Prologue", "act", "tr")).toBe("Prolog");
    expect(localizeStructure("Epilogue", "act", "tr")).toBe("Epilog");
  });

  it("names a bare numeral by its kind", () => {
    expect(localizeStructure("2", "act", "tr")).toBe("2. Perde");
    expect(localizeStructure("IX", "scene", "tr")).toBe("9. Sahne");
  });

  it("leaves what a script spelled out itself", () => {
    for (const label of ["The Ballroom", "INT. OFFICE - DAY", "Cold Open", "Birinci Perde", "C", "Scene 2 (cont.)"]) {
      expect(localizeStructure(label, "scene", "tr")).toBe(label);
    }
    expect(localizeStructure("Scene 2", "act", "tr")).toBe("Scene 2"); // not an act's shape
  });

  it("leaves English exactly as it was", () => {
    for (const label of ["Act 1", "Act III", "2", "Prologue", "Scene 2", "The Ballroom"]) {
      expect(localizeStructure(label, "act", "en")).toBe(label);
      expect(localizeStructure(label, "scene", "en")).toBe(label);
    }
  });

  it("passes empty values through", () => {
    expect(localizeStructure(null, "act", "tr")).toBeNull();
    expect(localizeStructure(undefined, "scene", "tr")).toBeUndefined();
    expect(localizeStructure("", "act", "tr")).toBe("");
  });
});
