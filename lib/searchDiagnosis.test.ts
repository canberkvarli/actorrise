import { describe, expect, it } from "vitest";

import { funnelBars, queryFilter, type Diagnosis } from "./searchDiagnosis";

const D: Diagnosis = {
  total: 1250,
  found: 903,
  short: 347,
  have_it: { searches: 71, queries: [{ query: "potter", count: 2 }] },
  missing: { searches: 138, queries: [{ query: "lila", count: 5 }] },
  most_asked: [{ query: "comedic monologue", count: 23 }],
  struggling_actors: 14,
};

describe("funnelBars", () => {
  it("gives each bar its share of the total", () => {
    const [found, short] = funnelBars(D);
    expect(found.pct).toBe(72);
    expect(short.pct).toBe(28);
  });

  it("bars sum to 100 so the picture cannot lie", () => {
    const [found, short] = funnelBars(D);
    expect(found.pct + short.pct).toBe(100);
  });

  it("survives an empty window instead of dividing by zero", () => {
    const empty = { ...D, total: 0, found: 0, short: 0 };
    const [found, short] = funnelBars(empty);
    expect(found.pct).toBe(0);
    expect(short.pct).toBe(0);
  });
});

describe("queryFilter", () => {
  it("builds a filter that opens the searches behind one query", () => {
    expect(queryFilter("lila")).toEqual({
      q: "lila",
      source: "all",
      problem: "any",
      user: "",
    });
  });
});
