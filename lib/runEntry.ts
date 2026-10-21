import { trackEvent } from "@/lib/events";
import { primeRunAudio } from "@/lib/runAudio";

/**
 * "Run it": the next step on a monologue's own page.
 *
 * Which button on the page was used. `sheet` sits under the title on wide
 * screens, `bar` is the bar at the foot of a phone, `margin` the side column,
 * `saved` the panel that opens after saving the piece.
 */
export type RunSurface = "sheet" | "bar" | "margin" | "saved";

/** Where the run goes. `go=hear` asks the room to read the piece first. */
export function runHref(monologueId: number): string {
  return `/monologue/${monologueId}/work?go=hear`;
}

/**
 * Call from inside the tap. Unlocks the audio first (it has to happen in the
 * gesture), records the tap, and returns the route to push.
 */
export function tapRun(monologueId: number, surface: RunSurface): string {
  primeRunAudio();
  trackEvent("run_entry_tapped", { monologue_id: monologueId, surface });
  return runHref(monologueId);
}
