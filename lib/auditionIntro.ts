/**
 * The three-card intro on /auditions: has this browser seen it?
 *
 * localStorage can throw (private mode, blocked site data). A browser that
 * cannot remember the intro would get it on every visit, so a throw reads as
 * "seen" and the intro stays shut. The header link still opens it.
 */

export const AUDITION_INTRO_KEY = "aud-intro-seen";

type GetStorage = () => Pick<Storage, "getItem" | "setItem">;

const local: GetStorage = () => window.localStorage;

export function readIntroSeen(storage: GetStorage = local): boolean {
  try {
    return storage().getItem(AUDITION_INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen(storage: GetStorage = local): void {
  try {
    storage().setItem(AUDITION_INTRO_KEY, "1");
  } catch {
    /* nothing to remember it in; it just won't open by itself again this visit */
  }
}

/**
 * Only someone with an empty rail, a loaded list and an unseen intro gets it
 * unasked, and not when they arrived to add one (`adding`).
 */
export function shouldAutoShowIntro(s: { loading: boolean; failed: boolean; count: number; seen: boolean; adding?: boolean }): boolean {
  return !s.loading && !s.failed && s.count === 0 && !s.seen && !s.adding;
}

export const AUDITION_LOOP_KEY = "arc.auditionsLoopOpen";

/** Whether the small How-it-works loop is open under the paste box. */
export function readLoopOpen(fallback: boolean, storage: GetStorage = local): boolean {
  try {
    const v = storage().getItem(AUDITION_LOOP_KEY);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function writeLoopOpen(open: boolean, storage: GetStorage = local): void {
  try {
    storage().setItem(AUDITION_LOOP_KEY, open ? "1" : "0");
  } catch {
    /* private mode: it just comes back next visit */
  }
}
