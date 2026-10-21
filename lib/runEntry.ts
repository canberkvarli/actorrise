import { trackEvent } from "@/lib/events";
import { primeMic, isPhoneUserAgent } from "@/lib/runMic";

/**
 * "Run it": the next step on a monologue's own page.
 *
 * Which button on the page was used. `sheet` sits under the title on wide
 * screens, `bar` is the bar at the foot of a phone, `margin` the side column,
 * `saved` the panel that opens after saving the piece.
 */
export type RunSurface = "sheet" | "bar" | "margin" | "saved";

/** Where the run goes. `go=run` starts it on arrival, no start screen. */
export function runHref(monologueId: number): string {
  return `/monologue/${monologueId}/work?go=run`;
}

/**
 * Call from inside the tap. Records the tap and returns the route to push.
 *
 * Off a phone the run listens, and the first microphone request needs a
 * gesture, so it is asked for here, inside this tap, and the room inherits the
 * answer. A phone runs by tap and is not asked at all.
 */
export async function tapRun(monologueId: number, surface: RunSurface): Promise<string> {
  trackEvent("run_entry_tapped", { monologue_id: monologueId, surface });
  if (typeof navigator !== "undefined" && !isPhoneUserAgent(navigator.userAgent, navigator.maxTouchPoints)) {
    await primeMic();
  }
  return runHref(monologueId);
}
