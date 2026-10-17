import { describe, expect, it } from "vitest";
import { PHONE_QUERY, isPhoneViewport } from "./viewport";

describe("isPhoneViewport", () => {
  it("asks the phone query", () => {
    let asked = "";
    const mm = (q: string) => {
      asked = q;
      return { matches: true };
    };
    expect(isPhoneViewport(mm)).toBe(true);
    expect(asked).toBe(PHONE_QUERY);
  });
  it("is false without matchMedia", () => {
    expect(isPhoneViewport(undefined)).toBe(false);
  });
});
