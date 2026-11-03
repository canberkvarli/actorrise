import { describe, expect, it } from "vitest";

import { splitLines } from "./text";

describe("splitLines", () => {
  it("keeps the playwright's line breaks", () => {
    const t = "To be, or not to be.\nThat is the question.\nWhether 'tis nobler\nIn the mind to suffer";
    expect(splitLines(t)).toHaveLength(4);
  });

  it("cuts a prose block at sentence ends", () => {
    const t = "I came home. Nobody was there! Was it always like this? I think so.";
    expect(splitLines(t)).toEqual(["I came home.", "Nobody was there!", "Was it always like this?", "I think so."]);
  });

  it("keeps a closing quote with its sentence and drops blank lines", () => {
    expect(splitLines('He said "go." Then he left.\n\n')).toEqual(['He said "go."', "Then he left."]);
  });
});
