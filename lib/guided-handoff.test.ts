import { describe, expect, it } from "vitest";
import {
  clearHandoff,
  HANDOFF_KEY,
  HANDOFF_TTL_MS,
  readHandoff,
  writeHandoff,
} from "./guided-handoff";

const T0 = 1_800_000_000_000;

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const brokenStore = {
  getItem: () => {
    throw new Error("private mode");
  },
  setItem: () => {
    throw new Error("private mode");
  },
  removeItem: () => {
    throw new Error("private mode");
  },
};

describe("the handoff", () => {
  it("carries what the tap learned", () => {
    const store = memoryStore();
    writeHandoff(store, "granted", T0);
    expect(readHandoff(store, T0 + 3000)).toEqual({ mic: "granted", at: T0 });
  });

  it("carries a refusal too", () => {
    const store = memoryStore();
    writeHandoff(store, "denied", T0);
    expect(readHandoff(store, T0 + 3000)?.mic).toBe("denied");
  });

  it("is nothing when nobody tapped", () => {
    expect(readHandoff(memoryStore(), T0)).toBeNull();
  });

  it("goes stale", () => {
    const store = memoryStore();
    writeHandoff(store, "granted", T0);
    expect(readHandoff(store, T0 + HANDOFF_TTL_MS)).not.toBeNull();
    expect(readHandoff(store, T0 + HANDOFF_TTL_MS + 1)).toBeNull();
  });

  it("does not believe a tap from the future", () => {
    const store = memoryStore();
    writeHandoff(store, "granted", T0 + 60_000);
    expect(readHandoff(store, T0)).toBeNull();
  });

  it("is used once", () => {
    const store = memoryStore();
    writeHandoff(store, "granted", T0);
    clearHandoff(store);
    expect(readHandoff(store, T0)).toBeNull();
  });

  it("reads junk as nothing", () => {
    for (const raw of ["", "{", "null", '"granted"', '{"mic":"maybe","at":1}', '{"mic":"granted"}', '{"mic":"granted","at":"now"}']) {
      expect(readHandoff(memoryStore({ [HANDOFF_KEY]: raw }), T0), raw).toBeNull();
    }
  });

  it("survives storage that throws", () => {
    expect(() => writeHandoff(brokenStore, "granted", T0)).not.toThrow();
    expect(readHandoff(brokenStore, T0)).toBeNull();
    expect(() => clearHandoff(brokenStore)).not.toThrow();
  });
});
