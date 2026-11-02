/**
 * Laban's effort cube, as plain numbers.
 *
 * Nothing in here knows how it is drawn. The web Studio renders it with
 * three.js; Ghost Light can import this file as it is and draw the same
 * thing with Skia. Keep it free of DOM, React and three.
 *
 * A point in the cube is three factors, each from -1 to 1:
 *   weight  -1 light      .. +1 strong
 *   space   -1 flexible   .. +1 direct
 *   time    -1 sustained  .. +1 sudden
 *
 * The eight corners are Laban's working actions (Laban and Lawrence,
 * "Effort", 1947). Flow is the fourth factor; it is left out of the
 * working actions on purpose, as Laban did.
 */

export type EffortPoint = { weight: number; space: number; time: number };

export type ActionId =
  | "punch"
  | "press"
  | "slash"
  | "wring"
  | "dab"
  | "glide"
  | "flick"
  | "float";

export type Action = {
  id: ActionId;
  name: string;
  /** The corner, each factor -1 or +1. */
  corner: EffortPoint;
  /** One line, in our own words, of how it feels to do. */
  feel: string;
};

export const ACTIONS: readonly Action[] = [
  { id: "punch", name: "Punch", corner: { weight: 1, space: 1, time: 1 }, feel: "All of you, straight at it, now." },
  { id: "press", name: "Press", corner: { weight: 1, space: 1, time: -1 }, feel: "Heavy and patient, pushing through something that won't give." },
  { id: "slash", name: "Slash", corner: { weight: 1, space: -1, time: 1 }, feel: "A sudden, wide, heavy sweep that takes the whole room." },
  { id: "wring", name: "Wring", corner: { weight: 1, space: -1, time: -1 }, feel: "Twisting slowly, hard, from many directions at once." },
  { id: "dab", name: "Dab", corner: { weight: -1, space: 1, time: 1 }, feel: "Small, exact, quick touches. There, and there." },
  { id: "glide", name: "Glide", corner: { weight: -1, space: 1, time: -1 }, feel: "Smooth and light, on one line, never rushed." },
  { id: "flick", name: "Flick", corner: { weight: -1, space: -1, time: 1 }, feel: "Light, quick, scattered, gone before it lands." },
  { id: "float", name: "Float", corner: { weight: -1, space: -1, time: -1 }, feel: "Weightless, drifting, in no hurry to arrive." },
];

export const FACTORS = {
  weight: { name: "Weight", neg: "Light", pos: "Strong" },
  space: { name: "Space", neg: "Flexible", pos: "Direct" },
  time: { name: "Time", neg: "Sustained", pos: "Sudden" },
} as const;

export type FactorKey = keyof typeof FACTORS;

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));
const unit = (v: number) => (clamp(v) + 1) / 2; // -1..1 -> 0..1

export function clampPoint(p: EffortPoint): EffortPoint {
  return { weight: clamp(p.weight), space: clamp(p.space), time: clamp(p.time) };
}

/**
 * How much of each action is in a point: trilinear weights over the eight
 * corners. They always sum to 1. A corner gives 1 for its own action.
 */
export function blend(p: EffortPoint): Record<ActionId, number> {
  const out = {} as Record<ActionId, number>;
  for (const a of ACTIONS) {
    out[a.id] =
      ((1 + a.corner.weight * clamp(p.weight)) / 2) *
      ((1 + a.corner.space * clamp(p.space)) / 2) *
      ((1 + a.corner.time * clamp(p.time)) / 2);
  }
  return out;
}

export type Reading = {
  /** The strongest action. */
  main: Action;
  mainShare: number;
  /** The next one, when it is worth naming. */
  second: Action | null;
  secondShare: number;
  /** "Mostly wring, a little press." */
  sentence: string;
  /** "Strong, a little flexible, sustained" */
  factors: string;
};

function factorWord(v: number, f: (typeof FACTORS)[FactorKey]): string | null {
  const a = Math.abs(v);
  if (a < 0.15) return null;
  const word = (v > 0 ? f.pos : f.neg).toLowerCase();
  if (a < 0.45) return `a little ${word}`;
  if (a > 0.85) return `very ${word}`;
  return word;
}

export function read(p: EffortPoint): Reading {
  const b = blend(p);
  const ranked = [...ACTIONS].sort((x, y) => b[y.id] - b[x.id]);
  const main = ranked[0];
  const second = ranked[1];
  const mainShare = b[main.id];
  const secondShare = b[second.id];

  let sentence: string;
  if (mainShare < 0.2) sentence = "In the middle of everything.";
  else if (mainShare > 0.8) sentence = `${main.name}.`;
  else if (mainShare - secondShare < 0.06)
    sentence = `Between ${main.name.toLowerCase()} and ${second.name.toLowerCase()}.`;
  else if (mainShare > 0.4)
    sentence = `Mostly ${main.name.toLowerCase()}, a little ${second.name.toLowerCase()}.`;
  else sentence = `Leaning ${main.name.toLowerCase()}, still searching.`;

  const words = (Object.keys(FACTORS) as FactorKey[])
    .map((k) => factorWord(p[k], FACTORS[k]))
    .filter(Boolean) as string[];
  const factors = words.length ? words.join(", ") : "balanced on all three";

  return {
    main,
    mainShare,
    second: secondShare > 0.12 ? second : null,
    secondShare,
    sentence,
    factors: factors.charAt(0).toUpperCase() + factors.slice(1),
  };
}

/** Numbers a renderer turns into motion. Every field is 0..1. */
export type MotionQualities = {
  /** 0 light .. 1 strong: size, mass, how low it sits, how hot it glows. */
  mass: number;
  /** 0 flexible .. 1 direct: curved, spiralling path .. one straight line. */
  directness: number;
  /** 0 sustained .. 1 sudden: continuous .. bursts with stillness between. */
  suddenness: number;
};

export function qualities(p: EffortPoint): MotionQualities {
  return { mass: unit(p.weight), directness: unit(p.space), suddenness: unit(p.time) };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

/**
 * Where the gesture is at time `t` (seconds), around the origin, roughly
 * within a unit sphere. Pure maths, so any renderer can trace it.
 *
 *  - Time decides the rhythm: sustained moves evenly; sudden strikes fast
 *    and then holds still.
 *  - Space decides the path: direct goes out and back along one line;
 *    flexible curls through a 3D figure-of-eight.
 *  - Weight decides the size and gravity: strong is big and sinks; light is
 *    small, lifts and drifts.
 */
export function gestureAt(t: number, q: MotionQualities): [number, number, number] {
  // Rhythm. One beat per `period` seconds.
  const period = mix(2.6, 1.15, q.suddenness) * mix(0.85, 1.15, q.mass);
  const beats = t / period;
  const whole = Math.floor(beats);
  const frac = beats - whole;
  // Sudden: the move happens in the first ~22% of the beat, then stillness.
  const strike = Math.min(1, frac / 0.22);
  const sharp = 1 - Math.pow(1 - strike, 3);
  const phase = whole + mix(frac, sharp, q.suddenness);

  const size = mix(0.45, 1.0, q.mass);

  // Direct: out along one line toward a target and back (a triangle wave).
  const tri = 1 - Math.abs(((phase % 2) + 2) % 2 - 1) * 2; // -1..1
  const direct: [number, number, number] = [tri * 0.95, tri * 0.25 - 0.05, tri * 0.35];

  // Flexible: a wandering 3D figure-of-eight.
  const a = phase * TAU * 0.5;
  const flexible: [number, number, number] = [
    Math.sin(a) * 0.9,
    Math.sin(a * 2 + 0.6) * 0.45,
    Math.cos(a * 1.5) * 0.7,
  ];

  // Light things lift and drift a little on their own.
  const drift = (1 - q.mass) * 0.12;
  const lift = mix(0.25, -0.2, q.mass);

  return [
    (mix(flexible[0], direct[0], q.directness) + Math.sin(t * 0.7) * drift) * size,
    (mix(flexible[1], direct[1], q.directness) + Math.cos(t * 0.9) * drift) * size + lift,
    (mix(flexible[2], direct[2], q.directness) + Math.sin(t * 1.1 + 1) * drift) * size,
  ];
}

/** The cube's centre and each corner, as start points worth jumping to. */
export const CENTRE: EffortPoint = { weight: 0, space: 0, time: 0 };

export function actionPoint(id: ActionId): EffortPoint {
  const a = ACTIONS.find((x) => x.id === id);
  return a ? { ...a.corner } : CENTRE;
}
