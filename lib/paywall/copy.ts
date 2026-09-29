/**
 * What each ask says. Two lines at most, about the thing the actor was just
 * doing.
 *
 * `variant` is logged on paywall_hit, so a rewrite can be read against the
 * wording it replaced: change the words, change the letter.
 *
 * No trial length in here. That is the server's to say (lib/trial.ts), and the
 * button beside these words already says it.
 */

export type GateCopy = { variant: string; headline: string; body: string };

export const GATE_COPY = {
  third_save: {
    variant: "third_save_a",
    headline: "Three pieces. That's a book.",
    // Only what Plus really adds. Saving, cutting and notes are free, so none
    // of them can be the reason given here.
    body: "Plus lets you rehearse every one of them out loud, as many times as it takes.",
  },
  reads_meter: {
    variant: "reads_meter_a",
    headline: "",
    body: "{left} free {reads} left this month. Plus opens every piece.",
  },
  scene_completed: {
    variant: "scene_completed_a",
    headline: "Nice run.",
    body: "That was my script though, not yours. Upload your own sides and run them the same way, with the same partner.",
  },
  monologue_completed: {
    variant: "monologue_completed_a",
    headline: "Keep the stage.",
    body: "Free runs are capped. Plus takes the cap off and lets you bring your own sides in to rehearse the same way.",
  },
  lines_delivered: {
    variant: "lines_delivered_a",
    headline: "",
    body: "Want to run your own sides like this?",
  },
} satisfies Record<string, GateCopy>;

/** The reads meter's one line. The count comes off the server at render. */
export function readsLeftLine(left: number): string {
  return GATE_COPY.reads_meter.body
    .replace("{left}", String(left))
    .replace("{reads}", left === 1 ? "read" : "reads");
}
