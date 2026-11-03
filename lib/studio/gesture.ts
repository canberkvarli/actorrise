/**
 * The psychological gesture, after Michael Chekhov ("To the Actor").
 *
 * One big, whole-body movement that holds what the character wants. The verb
 * is the what (push, pull, tear…), the quality is the how ("with caution"),
 * then tempo and legato/staccato. It is rehearsed full out, then made smaller
 * and smaller until it lives inside and only colours how the lines are said.
 *
 * Here a gesture is a small spec, and `poseAt` turns it into a body pose at any
 * moment: plain numbers (radians, 0..1), no renderer. The web draws it with
 * three.js; Ghost Light can draw the same poses. The verb list follows
 * Chekhov's archetypal gestures; the wording is ours.
 */

import { clampPoint, type EffortPoint } from "./effort";

/* ---------------- The body, as numbers ---------------- */

export type Arm = {
  /** 0 hanging, π/2 straight forward, π straight up. */
  raise: number;
  /** Opening out to the side; negative crosses in front. */
  spread: number;
  /** Elbow: 0 straight .. ~2.2 folded. */
  bend: number;
};

export type Pose = {
  /** Torso: + leans forward, − back. */
  lean: number;
  /** Torso twist: + turns to the figure's left. */
  twist: number;
  /** 0 standing, 1 deep crouch, below 0 up on the toes. */
  crouch: number;
  arms: [Arm, Arm]; // [left, right]
};

const A = (raise: number, spread: number, bend: number): Arm => ({ raise, spread, bend });
const both = (a: Arm): [Arm, Arm] => [a, { ...a }];

export const NEUTRAL: Pose = { lean: 0, twist: 0, crouch: 0, arms: both(A(0.15, 0.12, 0.15)) };

/* ---------------- The verbs ---------------- */

export type VerbId =
  | "push"
  | "pull"
  | "lift"
  | "throw"
  | "wring"
  | "tear"
  | "embrace"
  | "open"
  | "close"
  | "penetrate"
  | "smash"
  | "gather"
  | "scatter"
  | "reach";

export type Verb = {
  id: VerbId;
  name: string;
  /** One line: what wanting this feels like. */
  feel: string;
  start: Pose;
  peak: Pose;
  /** 0 light .. 1 heavy, for the Laban reading. */
  weight: number;
  /** 0 flexible .. 1 direct, for the Laban reading. */
  direct: number;
};

export const VERBS: readonly Verb[] = [
  {
    id: "push",
    name: "Push",
    feel: "Get it away from you. Make room.",
    start: { lean: -0.1, twist: 0, crouch: 0.1, arms: both(A(0.95, 0.15, 1.8)) },
    peak: { lean: 0.38, twist: 0, crouch: 0.18, arms: both(A(1.5, 0.12, 0.05)) },
    weight: 0.85,
    direct: 0.9,
  },
  {
    id: "pull",
    name: "Pull",
    feel: "Bring it to you. Make it yours.",
    start: { lean: 0.3, twist: 0, crouch: 0.12, arms: both(A(1.45, 0.1, 0.05)) },
    peak: { lean: -0.32, twist: 0, crouch: 0.2, arms: both(A(0.85, 0.2, 2.0)) },
    weight: 0.8,
    direct: 0.8,
  },
  {
    id: "lift",
    name: "Lift",
    feel: "Raise it up, raise yourself, rise above.",
    start: { lean: 0.3, twist: 0, crouch: 0.5, arms: both(A(0.35, 0.15, 0.4)) },
    peak: { lean: -0.18, twist: 0, crouch: -0.12, arms: both(A(2.95, 0.15, 0.08)) },
    weight: 0.55,
    direct: 0.75,
  },
  {
    id: "throw",
    name: "Throw",
    feel: "Get rid of it, hurl it out of your life.",
    start: { lean: -0.15, twist: -0.65, crouch: 0.15, arms: [A(1.1, 0.5, 0.4), A(2.5, 0.7, 0.9)] },
    peak: { lean: 0.35, twist: 0.55, crouch: 0.2, arms: [A(0.4, 0.3, 0.6), A(1.25, -0.2, 0.05)] },
    weight: 0.8,
    direct: 0.65,
  },
  {
    id: "wring",
    name: "Wring",
    feel: "Twist it until something gives.",
    start: { lean: 0.12, twist: -0.75, crouch: 0.15, arms: both(A(1.15, -0.25, 1.25)) },
    peak: { lean: 0.2, twist: 0.75, crouch: 0.28, arms: [A(1.0, -0.35, 1.45), A(1.3, -0.15, 1.1)] },
    weight: 0.9,
    direct: 0.15,
  },
  {
    id: "tear",
    name: "Tear",
    feel: "Rip it apart. Break free of it.",
    start: { lean: 0.15, twist: 0, crouch: 0.2, arms: both(A(1.3, -0.1, 1.3)) },
    peak: { lean: -0.12, twist: 0, crouch: 0.15, arms: both(A(1.45, 1.45, 0.1)) },
    weight: 0.85,
    direct: 0.55,
  },
  {
    id: "embrace",
    name: "Embrace",
    feel: "Hold it, keep it close, never let go.",
    start: { lean: -0.08, twist: 0, crouch: 0, arms: both(A(1.4, 1.35, 0.15)) },
    peak: { lean: 0.15, twist: 0, crouch: 0.08, arms: both(A(1.3, -0.35, 1.6)) },
    weight: 0.45,
    direct: 0.5,
  },
  {
    id: "open",
    name: "Open",
    feel: "Let it all in. Let yourself be seen.",
    start: { lean: 0.25, twist: 0, crouch: 0.22, arms: both(A(1.0, -0.45, 1.85)) },
    peak: { lean: -0.25, twist: 0, crouch: -0.05, arms: both(A(2.25, 1.2, 0.1)) },
    weight: 0.35,
    direct: 0.35,
  },
  {
    id: "close",
    name: "Close",
    feel: "Shut it out. Keep yourself safe.",
    start: { lean: -0.22, twist: 0, crouch: -0.03, arms: both(A(2.2, 1.15, 0.12)) },
    peak: { lean: 0.32, twist: 0, crouch: 0.32, arms: both(A(1.0, -0.45, 1.9)) },
    weight: 0.6,
    direct: 0.6,
  },
  {
    id: "penetrate",
    name: "Penetrate",
    feel: "Get through to the truth of it.",
    start: { lean: -0.05, twist: 0, crouch: 0.1, arms: both(A(0.55, 0.25, 1.1)) },
    peak: { lean: 0.48, twist: 0, crouch: 0.22, arms: both(A(1.55, -0.12, 0.02)) },
    weight: 0.7,
    direct: 1,
  },
  {
    id: "smash",
    name: "Smash",
    feel: "Destroy it. End it now.",
    start: { lean: -0.2, twist: 0, crouch: -0.05, arms: both(A(2.95, 0.2, 0.35)) },
    peak: { lean: 0.45, twist: 0, crouch: 0.45, arms: both(A(0.25, 0.05, 0.2)) },
    weight: 1,
    direct: 0.8,
  },
  {
    id: "gather",
    name: "Gather",
    feel: "Collect yourself. Bring it all in.",
    start: { lean: 0.2, twist: 0, crouch: 0.25, arms: both(A(0.75, 1.3, 0.15)) },
    peak: { lean: 0.05, twist: 0, crouch: 0.3, arms: both(A(1.05, -0.05, 1.75)) },
    weight: 0.5,
    direct: 0.4,
  },
  {
    id: "scatter",
    name: "Scatter",
    feel: "Fling it everywhere. Let it go to pieces.",
    start: { lean: 0.15, twist: 0, crouch: 0.3, arms: both(A(1.05, -0.05, 1.75)) },
    peak: { lean: -0.2, twist: 0, crouch: -0.05, arms: both(A(2.1, 1.5, 0.1)) },
    weight: 0.35,
    direct: 0.1,
  },
  {
    id: "reach",
    name: "Reach",
    feel: "Get to what's just out of reach.",
    start: { lean: 0, twist: 0, crouch: 0.05, arms: both(A(0.3, 0.15, 0.4)) },
    peak: { lean: 0.15, twist: 0.2, crouch: -0.12, arms: [A(0.5, 0.2, 0.3), A(2.35, 0.25, 0.02)] },
    weight: 0.35,
    direct: 0.85,
  },
];

/* ---------------- Direction, quality, tempo ---------------- */

export type DirectionId = "none" | "forward" | "back" | "up" | "down";
export const DIRECTIONS: { id: DirectionId; name: string }[] = [
  { id: "none", name: "As it comes" },
  { id: "forward", name: "Forward" },
  { id: "back", name: "Back" },
  { id: "up", name: "Up" },
  { id: "down", name: "Down" },
];

export type QualityId = "ease" | "tenderness" | "caution" | "joy" | "anger" | "fear" | "longing" | "contempt";

export type Quality = {
  id: QualityId;
  /** "with caution" */
  name: string;
  speed: number;
  amp: number;
  overshoot: number;
  tremor: number;
  hesitate: number;
  /** Shifts the Laban weight: − lighter, + heavier. */
  weight: number;
  lean: number;
};

export const QUALITIES: readonly Quality[] = [
  { id: "ease", name: "with ease", speed: 1, amp: 1, overshoot: 0, tremor: 0, hesitate: 0, weight: -0.25, lean: 0 },
  { id: "tenderness", name: "with tenderness", speed: 0.72, amp: 0.82, overshoot: 0, tremor: 0, hesitate: 0, weight: -0.45, lean: 0.03 },
  { id: "caution", name: "with caution", speed: 0.8, amp: 0.72, overshoot: 0, tremor: 0.05, hesitate: 0.75, weight: -0.1, lean: -0.05 },
  { id: "joy", name: "with joy", speed: 1.2, amp: 1.12, overshoot: 0.28, tremor: 0, hesitate: 0, weight: -0.3, lean: -0.05 },
  { id: "anger", name: "with anger", speed: 1.3, amp: 1.06, overshoot: 0.08, tremor: 0.35, hesitate: 0, weight: 0.4, lean: 0.06 },
  { id: "fear", name: "with fear", speed: 1.1, amp: 0.8, overshoot: 0, tremor: 0.6, hesitate: 0.35, weight: 0, lean: -0.1 },
  { id: "longing", name: "with longing", speed: 0.66, amp: 1.15, overshoot: 0, tremor: 0, hesitate: 0.1, weight: 0, lean: 0.06 },
  { id: "contempt", name: "with contempt", speed: 0.9, amp: 0.7, overshoot: 0, tremor: 0, hesitate: 0, weight: 0.15, lean: -0.18 },
];

export type TempoId = "slow" | "medium" | "quick";
export const TEMPOS: { id: TempoId; name: string; secs: number; time: number }[] = [
  { id: "slow", name: "Slow", secs: 4.8, time: -0.75 },
  { id: "medium", name: "Medium", secs: 3.2, time: 0 },
  { id: "quick", name: "Quick", secs: 1.9, time: 0.75 },
];

export type GestureSpec = {
  verb: VerbId;
  direction: DirectionId;
  quality: QualityId;
  tempo: TempoId;
  /** true staccato (strikes and holds), false legato (one flowing line). */
  staccato: boolean;
};

export const DEFAULT_GESTURE: GestureSpec = {
  verb: "push",
  direction: "none",
  quality: "ease",
  tempo: "medium",
  staccato: false,
};

const verbOf = (id: VerbId) => VERBS.find((v) => v.id === id) ?? VERBS[0];
const qualityOf = (id: QualityId) => QUALITIES.find((q) => q.id === id) ?? QUALITIES[0];
const tempoOf = (id: TempoId) => TEMPOS.find((t) => t.id === id) ?? TEMPOS[1];

/* ---------------- Time and pose ---------------- */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeOutBack = (t: number, s: number) => 1 + (s * 2.7 + 1) * Math.pow(t - 1, 3) + s * 2.7 * Math.pow(t - 1, 2);

/** Seconds a full cycle takes: gather, the gesture, the hold, the return. */
export function period(spec: GestureSpec): number {
  return tempoOf(spec.tempo).secs / qualityOf(spec.quality).speed;
}

/**
 * How far into the gesture the body is at time t, 0 (the start) .. 1 (the peak),
 * and how strongly it radiates (the hold after the peak).
 */
export function progressAt(spec: GestureSpec, t: number): { p: number; radiate: number } {
  const q = qualityOf(spec.quality);
  const u = (((t / period(spec)) % 1) + 1) % 1;
  const MOVE = 0.55;
  const HOLD = 0.75;
  let p: number;
  if (u < MOVE) {
    let m = u / MOVE;
    if (spec.staccato) m = clamp01(m / 0.45); // strike in under half the time, then sit in it
    let e = spec.staccato ? easeOutExpo(m) : easeInOut(m);
    if (q.overshoot) e = easeOutBack(clamp01(m), q.overshoot);
    // Caution and fear stop and start on the way.
    if (q.hesitate) e = clamp01(e - q.hesitate * 0.09 * Math.sin(m * Math.PI * 3) * (1 - m));
    p = e;
  } else if (u < HOLD) {
    p = 1;
  } else {
    p = 1 - easeInOut((u - HOLD) / (1 - HOLD));
  }
  const radiate = u >= MOVE && u < HOLD ? Math.sin(((u - MOVE) / (HOLD - MOVE)) * Math.PI) : 0;
  return { p, radiate };
}

function mixArm(a: Arm, b: Arm, t: number): Arm {
  return { raise: lerp(a.raise, b.raise, t), spread: lerp(a.spread, b.spread, t), bend: lerp(a.bend, b.bend, t) };
}

function directed(pose: Pose, dir: DirectionId, k: number): Pose {
  const out: Pose = { ...pose, arms: [{ ...pose.arms[0] }, { ...pose.arms[1] }] };
  if (dir === "forward") out.lean += 0.22 * k;
  if (dir === "back") out.lean -= 0.25 * k;
  if (dir === "up") {
    out.crouch -= 0.12 * k;
    out.lean -= 0.1 * k;
    out.arms.forEach((a) => (a.raise += 0.55 * k));
  }
  if (dir === "down") {
    out.crouch += 0.3 * k;
    out.lean += 0.15 * k;
    out.arms.forEach((a) => (a.raise -= 0.45 * k));
  }
  return out;
}

/**
 * The body at time t. `size` is how big the gesture is made: 1 full out, 0 inside
 * (the body all but still). Tremor is added for the qualities that shake.
 */
export function poseAt(spec: GestureSpec, t: number, size = 1): Pose {
  const v = verbOf(spec.verb);
  const q = qualityOf(spec.quality);
  const { p } = progressAt(spec, t);
  const start = directed(v.start, spec.direction, 0.4);
  const peak = directed(v.peak, spec.direction, 1);
  const amp = q.amp * clamp01(size);
  const at = (a: number, b: number, n: number) => n + (lerp(a, b, p) - n) * amp;
  const shake = q.tremor * 0.05 * (Math.sin(t * 41) + Math.sin(t * 67 + 1)) * clamp01(size + 0.15);
  const arms = [0, 1].map((i) => {
    const m = mixArm(start.arms[i], peak.arms[i], p);
    const n = NEUTRAL.arms[i];
    return {
      raise: n.raise + (m.raise - n.raise) * amp + shake,
      spread: n.spread + (m.spread - n.spread) * amp,
      bend: Math.max(0, n.bend + (m.bend - n.bend) * amp + shake * 0.5),
    };
  }) as [Arm, Arm];
  return {
    lean: at(start.lean, peak.lean, NEUTRAL.lean) + q.lean * amp + shake * 0.3,
    twist: at(start.twist, peak.twist, NEUTRAL.twist),
    crouch: at(start.crouch, peak.crouch, NEUTRAL.crouch),
    arms,
  };
}

/* ---------------- Reading it ---------------- */

/** Where the gesture sits in Laban's cube. */
export function effortOf(spec: GestureSpec): EffortPoint {
  const v = verbOf(spec.verb);
  const q = qualityOf(spec.quality);
  const t = tempoOf(spec.tempo);
  return clampPoint({
    weight: (v.weight + q.weight) * 2 - 1,
    space: v.direct * 2 - 1 - q.tremor * 0.6 - q.hesitate * 0.3,
    time: t.time + (spec.staccato ? 0.45 : -0.3) + (q.speed - 1) * 0.8,
  });
}

/** "Push, forward, with caution" */
export function describe(spec: GestureSpec): string {
  const v = verbOf(spec.verb);
  const d = DIRECTIONS.find((x) => x.id === spec.direction);
  const q = qualityOf(spec.quality);
  return [v.name, spec.direction !== "none" ? d?.name.toLowerCase() : null, q.name].filter(Boolean).join(", ");
}

export { verbOf, qualityOf, tempoOf };

/** Rebuild a spec from untrusted JSON (sync). */
export function cleanGesture(raw: unknown): GestureSpec | null {
  const g = raw as Partial<GestureSpec> | null;
  if (!g || typeof g !== "object") return null;
  if (!VERBS.some((v) => v.id === g.verb)) return null;
  return {
    verb: g.verb as VerbId,
    direction: DIRECTIONS.some((d) => d.id === g.direction) ? (g.direction as DirectionId) : "none",
    quality: QUALITIES.some((q) => q.id === g.quality) ? (g.quality as QualityId) : "ease",
    tempo: TEMPOS.some((t) => t.id === g.tempo) ? (g.tempo as TempoId) : "medium",
    staccato: g.staccato === true,
  };
}
