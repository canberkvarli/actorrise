/**
 * Everything the first run remembers OUTSIDE the database, in one place.
 *
 * The onboarding card and the tours each keep a client-side latch, for good
 * reasons: the server flags are written asynchronously and the in-memory user
 * is stale for a moment after onboarding closes, so the latches cover that
 * window. But a latch keyed to the browser rather than the account outlives the
 * account. Sign out, sign up again in the same tab, and the new user is told
 * they have already seen a tour they have never seen — which is exactly what
 * makes a first-run change untestable without a fresh browser profile.
 *
 * So: cleared whenever the person changes, on logout and on signup.
 *
 * `sp_walkthrough_seen_v1` is localStorage rather than session, and it belongs
 * to the ScenePartner playbill. It is cleared on SIGNUP only. A returning actor
 * on their own machine should not be re-pitched the basics, but a brand-new
 * account on a machine that has seen the product before is a new person as far
 * as that playbill is concerned.
 */

export const TOUR_LATCH_KEY = "actorrise_tour_seen";
export const ONBOARDING_LATCH_KEY = "actorrise_onboarding_done";

/** Per-session latches: tours dismissed, onboarding finished, first scene handled. */
const SESSION_KEYS = [
  TOUR_LATCH_KEY,
  ONBOARDING_LATCH_KEY,
  "actorrise_first_scene_handled",
];

/** Per-browser: the ScenePartner playbill. */
const LOCAL_KEYS = ["sp_walkthrough_seen_v1"];

/** On logout: drop the session latches, leave the browser-level one alone. */
export function clearFirstRunSession() {
  try {
    SESSION_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* storage unavailable — nothing was latched either */
  }
}

/** On signup: a genuinely new account, so drop everything the browser remembers. */
export function clearFirstRunAll() {
  clearFirstRunSession();
  try {
    LOCAL_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}
