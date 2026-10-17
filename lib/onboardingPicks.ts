/** How many picks the onboarding card kept, carried to the win screen of the
 *  first scene and read once. sessionStorage: it is about this sitting. */
export const PICKS_KEPT_KEY = "arc.onboardingPicksKept";

type GetStorage = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session: GetStorage = () => window.sessionStorage;

export function noteOnboardingPicksKept(count: number, storage: GetStorage = session): void {
  if (count <= 0) return;
  try {
    storage().setItem(PICKS_KEPT_KEY, String(count));
  } catch {
    /* private mode: the win screen just says nothing about the shelf */
  }
}

export function takeOnboardingPicksKept(storage: GetStorage = session): number {
  try {
    const raw = storage().getItem(PICKS_KEPT_KEY);
    if (raw === null) return 0;
    storage().removeItem(PICKS_KEPT_KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
