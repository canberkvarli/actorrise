/**
 * Reading a real movement as Laban effort. Plain maths over joint positions:
 * no camera, no model, no renderer, so it is tested with made-up movements and
 * Ghost Light can use it with the phone's own pose tracker.
 *
 * Input: a few seconds of frames, each with the two wrists, shoulders and hips
 * in metres, body-centred (MediaPipe's world landmarks), y up.
 *
 *  - Time   (sudden .. sustained): one short burst at high speed is sudden;
 *    moving all the way through at an even speed is sustained.
 *  - Weight (strong .. light): hard stops (big braking at the end of a
 *    stroke) and the whole body going with it read strong; small, floating
 *    hands with a still body read light.
 *  - Space  (direct .. flexible): straight strokes read direct; curling,
 *    wandering ones flexible. Strokes are cut at the stillnesses between them,
 *    so a punch that goes out and comes back is still two straight lines.
 *
 * It is a reading, not a grade: it puts words to what the body did.
 */

import { clampPoint, type EffortPoint } from "./effort";

export type V3 = [number, number, number];

export type Frame = {
  /** seconds */
  t: number;
  lw: V3;
  rw: V3;
  ls: V3;
  rs: V3;
  lh: V3;
  rh: V3;
};

export type MotionReading = {
  point: EffortPoint;
  /** 0..1: how much there was to read (a near-still body reads low). */
  confidence: number;
  /** The two hands' paths through the movement, ~64 points each, body-centred metres, y up. */
  paths: [V3[], V3[]];
  /** What it was read from, for the curious and for tests. */
  facts: { peakSpeed: number; activeSecs: number; straightness: number; peakBrake: number; bodyTravel: number };
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mid = (a: V3, b: V3): V3 => scale(add(a, b), 0.5);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A light moving average: trackers jitter, and jitter reads as "flexible". */
function smooth(pts: V3[], w = 2): V3[] {
  return pts.map((_, i) => {
    let acc: V3 = [0, 0, 0];
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(pts.length - 1, i + w); j++) {
      acc = add(acc, pts[j]);
      n++;
    }
    return scale(acc, 1 / n);
  });
}

function resample(pts: V3[], n: number): V3[] {
  if (pts.length <= 1) return pts.slice();
  return Array.from({ length: n }, (_, i) => {
    const f = (i / (n - 1)) * (pts.length - 1);
    const a = Math.floor(f);
    const b = Math.min(pts.length - 1, a + 1);
    const k = f - a;
    return add(scale(pts[a], 1 - k), scale(pts[b], k));
  });
}

export function readMotion(frames: Frame[]): MotionReading | null {
  if (frames.length < 12) return null;
  const T = frames.map((f) => f.t);
  const hands = [smooth(frames.map((f) => f.lw)), smooth(frames.map((f) => f.rw))];
  // Lighter smoothing for the shape of a stroke: a fast arc is only a few frames long.
  const shapes = [smooth(frames.map((f) => f.lw), 1), smooth(frames.map((f) => f.rw), 1)];
  const chest = smooth(frames.map((f) => mid(f.ls, f.rs)));

  // Speed of each hand, per frame; the movement is whichever hand is moving more.
  const speeds = hands.map((h) =>
    h.map((p, i) => (i === 0 ? 0 : len(sub(p, h[i - 1])) / Math.max(1e-3, T[i] - T[i - 1]))),
  );
  const speed = speeds[0].map((s, i) => Math.max(s, speeds[1][i]));
  const peakSpeed = Math.max(...speed);
  // Nothing moved enough to read: judged by how far the hands went, so a slow press still counts.
  const travel = hands.map((h) => h.reduce((acc, p, i) => (i ? acc + len(sub(p, h[i - 1])) : 0), 0));
  if (Math.max(...travel) < 0.12 || peakSpeed < 0.06) return null;

  // The active part: above a quarter of the peak.
  const threshold = Math.max(0.04, peakSpeed * 0.25);
  let activeSecs = 0;
  for (let i = 1; i < speed.length; i++) if (speed[i] > threshold) activeSecs += T[i] - T[i - 1];
  const total = T[T.length - 1] - T[0];
  const first = speed.findIndex((s) => s > threshold);
  const last = speed.length - 1 - [...speed].reverse().findIndex((s) => s > threshold);

  // Braking: the hardest the hands slow down, m/s².
  let peakBrake = 0;
  for (let i = 2; i < speed.length; i++) {
    const dt = Math.max(1e-3, T[i] - T[i - 1]);
    peakBrake = Math.max(peakBrake, (speed[i - 1] - speed[i]) / dt);
  }

  // The body going with it: how far the chest travels.
  let bodyTravel = 0;
  for (const c of chest) bodyTravel = Math.max(bodyTravel, len(sub(c, chest[0])));

  // Straightness, stroke by stroke: cut at the slow points between strokes.
  let straightSum = 0;
  let lengthSum = 0;
  shapes.forEach((h, hi) => {
    const s = speeds[hi];
    let start = -1;
    const close = (end: number) => {
      if (start < 0 || end - start < 2) return;
      let path = 0;
      for (let i = start + 1; i <= end; i++) path += len(sub(h[i], h[i - 1]));
      if (path < 0.04) return;
      const chord = len(sub(h[end], h[start]));
      // How much the stroke turns: a fast arc caught in a few frames still turns a lot.
      let turning = 0;
      let prev: V3 | null = null;
      for (let i = start + 1; i <= end; i++) {
        const d = sub(h[i], h[i - 1]);
        const l = len(d);
        if (l < 0.01) continue;
        if (prev) {
          const c = (prev[0] * d[0] + prev[1] * d[1] + prev[2] * d[2]) / (len(prev) * l);
          turning += Math.acos(Math.max(-1, Math.min(1, c)));
        }
        prev = d;
      }
      const direct = Math.min(chord / path, 1 - clamp01(turning / 2.4));
      straightSum += direct * path;
      lengthSum += path;
    };
    for (let i = 0; i < s.length; i++) {
      const moving = s[i] > threshold * 0.6;
      if (moving && start < 0) start = Math.max(0, i - 1);
      if (!moving && start >= 0) {
        close(i);
        start = -1;
      }
    }
    close(s.length - 1);
  });
  const straightness = lengthSum > 0 ? straightSum / lengthSum : 0.7;

  // To the three factors.
  const burst = 1 - clamp01(activeSecs / Math.max(0.5, Math.min(total, 3)));
  const fast = clamp01((peakSpeed - 0.5) / 2.0);
  const time = (0.55 * burst + 0.45 * fast) * 2 - 1;

  const brake = clamp01(peakBrake / 22);
  const body = clamp01(bodyTravel / 0.22);
  // A press brakes softly but the whole body is in it; a float has neither.
  const weight = clamp01(0.55 * brake + 0.65 * body) * 2 - 1;

  const space = clamp01((straightness - 0.55) / 0.38) * 2 - 1;

  const confidence = clamp01(Math.max(...travel) / 0.4) * clamp01(frames.length / 40);

  const from = Math.max(0, first - 4);
  const to = Math.min(frames.length - 1, last + 4);
  const paths = hands.map((h) => resample(h.slice(from, to + 1), 64)) as [V3[], V3[]];

  return {
    point: clampPoint({ weight, space, time }),
    confidence,
    paths,
    facts: { peakSpeed, activeSecs, straightness, peakBrake, bodyTravel },
  };
}
