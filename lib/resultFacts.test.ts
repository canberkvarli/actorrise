import { describe, expect, it } from "vitest";
import { constantFacts, constantFactsLabel } from "./resultFacts";
import type { Monologue } from "@/types/actor";

function row(author: string | null, category: string | null): Monologue {
  return { id: Math.random(), author, category } as unknown as Monologue;
}

const shakespeare = (n: number) =>
  Array.from({ length: n }, () => row("William Shakespeare", "classical"));

describe("constantFacts", () => {
  it("spots the author and era every row shares", () => {
    // The real case: 18 rows that all said "William Shakespeare" and
    // "classical", which is 36 repetitions of two facts.
    const f = constantFacts(shakespeare(18));
    expect(f.author).toBe("William Shakespeare");
    expect(f.era).toBe("classical");
  });

  it("says nothing when the authors differ", () => {
    const list = [...shakespeare(5), row("Anton Chekhov", "classical")];
    const f = constantFacts(list);
    expect(f.author).toBeUndefined();
    // ...but the era is still shared, and still worth lifting.
    expect(f.era).toBe("classical");
  });

  it("says nothing when the eras differ", () => {
    const list = [...shakespeare(5), row("William Shakespeare", "contemporary")];
    expect(constantFacts(list).era).toBeUndefined();
    expect(constantFacts(list).author).toBe("William Shakespeare");
  });

  it("does not claim an author when one row is missing it", () => {
    // Otherwise the page states a fact about rows it cannot see.
    const list = [...shakespeare(5), row(null, "classical")];
    expect(constantFacts(list).author).toBeUndefined();
  });

  it("ignores a category that is neither era", () => {
    // Film/TV rows carry other things in this column; "drama" is not an era.
    const list = Array.from({ length: 6 }, () => row("Someone", "drama"));
    expect(constantFacts(list).era).toBeUndefined();
  });

  it("stays quiet on a short run of results", () => {
    // Two rows that agree are two rows that agree, not a pattern worth
    // hoisting out of them.
    expect(constantFacts(shakespeare(3))).toEqual({});
    expect(constantFacts(shakespeare(4)).author).toBe("William Shakespeare");
  });

  it("handles empty and non-array input", () => {
    expect(constantFacts([])).toEqual({});
    expect(constantFacts(undefined as unknown as Monologue[])).toEqual({});
  });
});

describe("constantFactsLabel", () => {
  it("joins what is shared", () => {
    expect(constantFactsLabel({ author: "William Shakespeare", era: "classical" }))
      .toBe("William Shakespeare · classical");
  });

  it("is null when nothing is shared, so no line renders", () => {
    expect(constantFactsLabel({})).toBeNull();
  });

  it("survives only one of the two", () => {
    expect(constantFactsLabel({ era: "contemporary" })).toBe("contemporary");
  });
});
