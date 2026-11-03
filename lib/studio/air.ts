/**
 * Atmospheres: the air of a moment, after Michael Chekhov ("To the Actor").
 *
 * Chekhov's point is that a scene has an air of its own, and the actor plays
 * in it, with it or against it. Each air here is a set of numbers a renderer
 * and a sound engine can use; the names and lines are ours. Plain data, so
 * Ghost Light can draw and sound the same airs.
 */

export type AirId = "still" | "dread" | "tender" | "festive" | "grief" | "danger" | "awe";

export type Air = {
  id: AirId;
  name: string;
  /** One line on what it is to stand in it. */
  feel: string;
  /** The space: background and haze. Hex. */
  sky: string;
  /** How close the haze comes in (smaller is thicker). */
  fogNear: number;
  fogFar: number;
  /** The glow on the floor. */
  floor: string;
  /** The colour of the dust in the air. */
  dust: string;
  /** -1 the air sinks .. +1 it rises. */
  drift: number;
  /** 0 calm .. 1 restless. */
  unrest: number;
  /** House light, 0.6 dim .. 1.15 bright. */
  light: number;
  /** Sound: the drone's root (Hz), how bright the hiss is (Hz), and how much it wavers. */
  tone: { root: number; hiss: number; waver: number };
};

export const AIRS: readonly Air[] = [
  {
    id: "still",
    name: "Still",
    feel: "Nothing is pressing yet. The room waits with you.",
    sky: "#130b08",
    fogNear: 10,
    fogFar: 24,
    floor: "#6b3414",
    dust: "#ffcf9e",
    drift: 0,
    unrest: 0.15,
    light: 1,
    tone: { root: 110, hiss: 900, waver: 0.1 },
  },
  {
    id: "dread",
    name: "Dread",
    feel: "Something is coming and everyone in the room knows it.",
    sky: "#070b0d",
    fogNear: 4,
    fogFar: 16,
    floor: "#1c3a3a",
    dust: "#9fc7c4",
    drift: -0.6,
    unrest: 0.35,
    light: 0.72,
    tone: { root: 55, hiss: 380, waver: 0.35 },
  },
  {
    id: "tender",
    name: "Tender",
    feel: "Soft enough that a loud word would hurt.",
    sky: "#170c0e",
    fogNear: 8,
    fogFar: 22,
    floor: "#7a3a46",
    dust: "#ffc2cf",
    drift: 0.25,
    unrest: 0.1,
    light: 0.95,
    tone: { root: 196, hiss: 1400, waver: 0.12 },
  },
  {
    id: "festive",
    name: "Festive",
    feel: "Bright, loud, everyone performing being happy.",
    sky: "#1a1006",
    fogNear: 12,
    fogFar: 28,
    floor: "#9a6a10",
    dust: "#ffe08a",
    drift: 0.5,
    unrest: 0.75,
    light: 1.15,
    tone: { root: 262, hiss: 2600, waver: 0.5 },
  },
  {
    id: "grief",
    name: "Grief",
    feel: "Heavy and quiet. Even the light seems to sit down.",
    sky: "#0c0d11",
    fogNear: 5,
    fogFar: 18,
    floor: "#2e3446",
    dust: "#b9bfd0",
    drift: -0.9,
    unrest: 0.05,
    light: 0.68,
    tone: { root: 73, hiss: 600, waver: 0.08 },
  },
  {
    id: "danger",
    name: "Danger",
    feel: "Hot and close. One wrong move and it goes.",
    sky: "#160605",
    fogNear: 6,
    fogFar: 18,
    floor: "#8a1a0a",
    dust: "#ff7a5a",
    drift: 0.1,
    unrest: 1,
    light: 0.9,
    tone: { root: 82, hiss: 1800, waver: 0.9 },
  },
  {
    id: "awe",
    name: "Awe",
    feel: "Bigger than you. You look up without meaning to.",
    sky: "#0b0816",
    fogNear: 9,
    fogFar: 30,
    floor: "#3d2a7a",
    dust: "#d6c8ff",
    drift: 0.9,
    unrest: 0.2,
    light: 1.05,
    tone: { root: 147, hiss: 3200, waver: 0.2 },
  },
];

export const STILL = AIRS[0];

export function airOf(id: AirId | null | undefined): Air {
  return AIRS.find((a) => a.id === id) ?? STILL;
}
