/**
 * The one line of house text above the script in the guided first scene.
 *
 * It changes three times and then goes quiet: "Listen." while the partner
 * opens, "Your line." when the mic opens, "That's it. Keep going." while the
 * partner answers the first line, and nothing after that. Two exceptions
 * outrank the sequence: a nudge after six quiet seconds with the mic open,
 * and tap mode when the mic is blocked or recognition threw.
 *
 * Pure. The rehearse page feeds it what it already knows; the tests hold the
 * rules. Spec: docs/superpowers/specs/2026-09-26-guided-first-scene-design.md
 */
export type CoachState = "listen" | "your_line" | "heard_first" | "quiet" | "nudge" | "tap_mode";

export interface CoachInput {
  /** Partner audio is loading or playing. */
  partnerSpeaking: boolean;
  /** The mic is open on the actor's line. */
  micOpen: boolean;
  /** Actor lines delivered so far in this run. */
  linesHeard: number;
  /** How long the mic has been open on this take. */
  msSinceMicOpened: number;
  /** The level gate has heard voice on this take. */
  voicedThisTake: boolean;
  /** Mic blocked or speech recognition broken: the actor taps each line. */
  tapMode: boolean;
}

export const NUDGE_AFTER_MS = 6000;

export const COACH_TEXT: Record<CoachState, string> = {
  listen: "Listen.",
  your_line: "Your line.",
  heard_first: "That's it. Keep going.",
  quiet: "",
  nudge: "Say it again, or tap it.",
  tap_mode: "Tap each line when you've said it.",
};

export function coachState(prev: CoachState, input: CoachInput): CoachState {
  if (input.tapMode) return "tap_mode";
  if (input.partnerSpeaking) {
    if (input.linesHeard === 0) return "listen";
    if (input.linesHeard === 1) return "heard_first";
    return "quiet";
  }
  if (input.micOpen) {
    if (!input.voicedThisTake && input.msSinceMicOpened >= NUDGE_AFTER_MS) return "nudge";
    return input.linesHeard === 0 ? "your_line" : "quiet";
  }
  return prev;
}
