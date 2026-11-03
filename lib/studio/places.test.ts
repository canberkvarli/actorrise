import { describe, expect, it } from "vitest";

import { newRole } from "./notebook";
import { buildCues, gist, hasPlaces } from "./places";

describe("buildCues", () => {
  it("runs breath, answers in order, the arc with its lines, first line, go", () => {
    const role = {
      ...newRole("Nina"),
      answers: { want: "To be seen.", who: "An actress." },
      moments: [{ id: "a", label: "The gull", note: "", point: { weight: 1, space: 1, time: 1 }, line: 1 }],
    };
    const cues = buildCues(role, ["First.", "Second."]);
    expect(cues.map((c) => c.kind)).toEqual(["breath", "answer", "answer", "moment", "first", "go"]);
    expect(cues[1]).toMatchObject({ ask: "Who you are" });
    expect(cues[3]).toMatchObject({ line: "Second.", label: "The gull" });
  });

  it("skips the first line without a piece, and knows when there's nothing to play", () => {
    expect(buildCues(newRole()).map((c) => c.kind)).toEqual(["breath", "go"]);
    expect(hasPlaces(newRole())).toBe(false);
  });
});

describe("gist", () => {
  it("keeps short answers and trims long ones at a sentence", () => {
    expect(gist("Short.")).toBe("Short.");
    const long = `${"I keep going back to the lake. ".repeat(8)}`;
    expect(gist(long).length).toBeLessThanOrEqual(180);
    expect(gist(long).endsWith(".")).toBe(true);
  });
});
