/**
 * Heat: the Studio is black and white until a movement has heat in it. Strong
 * and sudden burn (orange, then red); light and sustained stay white. One
 * function for the 3D and the interface, plain TS for Ghost Light.
 */

import type { EffortPoint } from "./effort";

/** 0 cool (light, sustained) .. 1 burning (strong, sudden). Weight counts most. */
export function heatOf(p: EffortPoint): number {
  const w = (p.weight + 1) / 2;
  const t = (p.time + 1) / 2;
  return Math.min(1, Math.max(0, 0.68 * w + 0.32 * t));
}

type RGB = [number, number, number];

// White until past the middle (neutral reads white), then amber, orange, red.
const STOPS: [number, RGB][] = [
  [0.0, [0.96, 0.96, 0.95]],
  [0.55, [0.98, 0.95, 0.9]],
  [0.7, [1.0, 0.72, 0.34]],
  [0.85, [1.0, 0.42, 0.12]],
  [1.0, [0.9, 0.15, 0.17]],
];

/** The colour of a heat, 0..1 channels. */
export function heatRGB(h: number): RGB {
  const x = Math.min(1, Math.max(0, h));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i];
    const [a, ca] = STOPS[i - 1];
    if (x <= b) {
      const k = (x - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** As a CSS colour, for text and borders. */
export function heatCSS(h: number, alpha = 1): string {
  const [r, g, b] = heatRGB(h).map((c) => Math.round(c * 255));
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
