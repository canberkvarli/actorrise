import { describe, expect, it } from "vitest";

import { read } from "./effort";
import { readMotion, type Frame, type V3 } from "./motion";

/** Synthetic movements at 30 fps: the right hand follows `path(u)` over [t0, t1]; the rest of the body as given. */
function move(
  path: (u: number) => V3,
  { secs = 4, t0 = 1, t1 = 2, body = 0 }: { secs?: number; t0?: number; t1?: number; body?: number } = {},
): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i <= secs * 30; i++) {
    const t = i / 30;
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const lean = body * u;
    frames.push({
      t,
      rw: path(u),
      lw: [-0.2, -0.1, 0.1],
      ls: [-0.18, 0.45, lean],
      rs: [0.18, 0.45, lean],
      lh: [-0.1, 0, 0],
      rh: [0.1, 0, 0],
    });
  }
  return frames;
}

// A strike that lands and stops dead: ease-in, then nothing.
const strike = (u: number) => u * u * u;
const even = (u: number) => u;

describe("readMotion", () => {
  it("a fast, straight strike with the body behind it reads as punch", () => {
    const r = readMotion(move((u) => [0.2, 0.2, 0.1 + 0.6 * strike(u)], { t0: 1, t1: 1.25, body: 0.25 }))!;
    expect(read(r.point).main.id).toBe("punch");
  });

  it("a slow, even, straight push with the body in it reads as press", () => {
    const r = readMotion(move((u) => [0.2, 0.2, 0.1 + 0.55 * even(u)], { t0: 0.5, t1: 3.5, body: 0.25 }))!;
    expect(read(r.point).main.id).toBe("press");
  });

  it("a slow, curling, light drift with a still body reads as float", () => {
    const r = readMotion(
      move((u) => [0.2 + 0.18 * Math.sin(u * 7), 0.2 + 0.18 * Math.cos(u * 5), 0.2 + 0.1 * Math.sin(u * 3)], {
        t0: 0.3,
        t1: 3.7,
      }),
    )!;
    expect(read(r.point).main.id).toBe("float");
  });

  it("a fast, wide, curved sweep that stops hard reads as slash", () => {
    const r = readMotion(
      move((u) => [0.6 * Math.cos(Math.PI * strike(u)), 0.3 * Math.sin(Math.PI * strike(u)), 0.3], {
        t0: 1,
        t1: 1.3,
        body: 0.2,
      }),
    )!;
    expect(read(r.point).main.id).toBe("slash");
  });

  it("does not read a body that barely moved, and gives two hand paths otherwise", () => {
    expect(readMotion(move(() => [0.2, 0.2, 0.2]))).toBeNull();
    const r = readMotion(move((u) => [0.2, 0.2, 0.6 * u], { t0: 1, t1: 2 }))!;
    expect(r.paths[0]).toHaveLength(64);
    expect(r.paths[1]).toHaveLength(64);
  });
});
