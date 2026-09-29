import { afterEach, describe, expect, it, vi } from "vitest";
import { claim, holder, release, subscribe } from "./slot";

afterEach(() => {
  for (const id of ["third_save", "reads_meter"]) release(id);
});

describe("the slot", () => {
  it("starts empty", () => {
    expect(holder()).toBeNull();
  });

  it("goes to the first ask that wants it", () => {
    expect(claim("third_save")).toBe(true);
    expect(holder()).toBe("third_save");
  });

  it("refuses a second ask while the first is up", () => {
    claim("third_save");
    expect(claim("reads_meter")).toBe(false);
    expect(holder()).toBe("third_save");
  });

  it("lets the holder claim again", () => {
    claim("third_save");
    expect(claim("third_save")).toBe(true);
  });

  it("frees up when the holder lets go", () => {
    claim("third_save");
    release("third_save");
    expect(claim("reads_meter")).toBe(true);
  });

  it("ignores a release from someone who does not hold it", () => {
    claim("third_save");
    release("reads_meter");
    expect(holder()).toBe("third_save");
  });

  it("tells subscribers when it changes hands, and only then", () => {
    const heard = vi.fn();
    const stop = subscribe(heard);
    claim("third_save");
    claim("third_save");
    claim("reads_meter");
    expect(heard).toHaveBeenCalledTimes(1);
    release("third_save");
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    claim("reads_meter");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
