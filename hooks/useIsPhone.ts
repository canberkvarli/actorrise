"use client";

import { useSyncExternalStore } from "react";

/**
 * Is this a phone-width screen?
 *
 * Read through useSyncExternalStore rather than an effect, for the two reasons
 * this repo always does: setState inside an effect is the cascading render its
 * React rules reject, and the server has no window — so the snapshot is
 * `false` there and the first client render corrects it without a mismatch,
 * because the subscription is real.
 *
 * For layout, prefer CSS. Media queries cost nothing and cannot get out of
 * step with the stylesheet. This is for the cases CSS genuinely cannot reach:
 * choosing SHORTER COPY on a narrow screen, or dropping a subtree entirely
 * rather than hiding it (a hidden element still mounts, still fetches, and is
 * still reachable by a screen reader and the tab key).
 *
 * 768px matches `md` and the tab bar's own breakpoint, so "phone" means the
 * same thing here as it does in the stylesheet.
 */
const QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  // addEventListener is unsupported on older Safari, which still ships
  // addListener; the app has users on old iPads.
  if (mql.addEventListener) {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  mql.addListener(onChange);
  return () => mql.removeListener(onChange);
}

function getSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Server render assumes desktop: the wider copy is the safer thing to ship. */
function getServerSnapshot() {
  return false;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useIsPhone;
