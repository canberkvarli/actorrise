/**
 * The one App Store URL, and a way to tell placements apart.
 *
 * Lives here rather than in `GhostLightAppTeaser` so server components can
 * import it. That file is `"use client"`, and pulling a constant out of a client
 * module into a server one drags the whole module boundary along with it.
 *
 * `ct` is Apple's campaign token. GA4 can only ever tell us that someone clicked
 * — the trail ends at the App Store boundary, so a click and an install look
 * identical from this side. The token comes out the other end in App Store
 * Connect under App Analytics → Acquisition → Campaigns, which is the only way
 * to learn that, say, the monologue pages install five times better than the
 * landing modal. Without it every placement is a guess forever.
 *
 * NO `mt=8`. Apple's campaign-link docs still show it, but it is an iTunes-era
 * parameter that adds nothing for an App Store app, and it went onto these links
 * in the same change where taps stopped opening the store on a phone. `ct` is the
 * part that carries value, so the legacy parameter goes rather than being left in
 * as an untested variable on the one journey that has to work.
 */

export const APP_STORE_URL =
  "https://apps.apple.com/us/app/ghost-light-monologues/id6804278673";

/** Campaign names are lowercase snake_case and appear verbatim in App Analytics. */
export type AppStorePlacement =
  | "monologue_page"
  | "landing_modal"
  | "landing_teaser"
  | "launch_bar"
  | "hero";

export function appStoreUrl(placement: AppStorePlacement): string {
  return `${APP_STORE_URL}?ct=${placement}`;
}
