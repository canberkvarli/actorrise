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

/**
 * Anyone who needs to re-render when these latches move.
 *
 * sessionStorage fires no event in the tab that wrote it, so a component
 * reading it through useSyncExternalStore with a no-op subscribe only learns
 * about a change when something ELSE re-renders it. That is exactly what kept
 * the first-run curtain up: the onboarding card finished, cleared the signup
 * flag, and the curtain — an opaque black rectangle over the whole app — sat
 * there until a background refreshUser() came back and changed the user
 * object. On a slow connection that was the last thing a brand-new account saw
 * of their first session.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeFirstRun(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((l) => l());
}

/**
 * "An account was just created in this tab."
 *
 * Set the moment signup succeeds, cleared when the onboarding card is done
 * with. It exists because the curtain cannot ask the user object: right after
 * signup there IS no user yet, auth is still loading, and a curtain that waits
 * for `has_completed_onboarding === false` is a curtain that arrives after the
 * dashboard has already painted. This flag is known synchronously, before the
 * first render of the platform, which is the only thing fast enough.
 */
export const SIGNUP_PENDING_KEY = "actorrise_signup_pending";

export function markSignupPending() {
  try {
    sessionStorage.setItem(SIGNUP_PENDING_KEY, "1");
  } catch {
    /* storage unavailable — the user-object check below still covers it */
  }
  notify();
}

export function clearSignupPending() {
  try {
    sessionStorage.removeItem(SIGNUP_PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
  notify();
}

/**
 * "Onboarding was finished or skipped in this tab."
 *
 * The durable record is the server flag, but it lands late. This is what the
 * curtain and the tours read in the meantime, and writing it is what tells
 * everyone watching that the house lights can come up.
 */
export function markOnboardingDoneLatch() {
  try {
    sessionStorage.setItem(ONBOARDING_LATCH_KEY, "1");
  } catch {
    /* sessionStorage unavailable — the server flag still covers the normal case */
  }
  notify();
}

export function isOnboardingDoneThisSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_LATCH_KEY) === "1";
  } catch {
    return false;
  }
}

export function isSignupPending(): boolean {
  try {
    return sessionStorage.getItem(SIGNUP_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

/** Per-session latches: tours dismissed, onboarding finished, first scene handled. */
const SESSION_KEYS = [
  TOUR_LATCH_KEY,
  ONBOARDING_LATCH_KEY,
  SIGNUP_PENDING_KEY,
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
  notify();
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
