"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the visitor has asked for reduced motion, as a subscription rather
 * than a one-shot read in an effect.
 *
 * This page is almost entirely motion, so the answer decides what several
 * components *render*, not just what they animate — the stage demo shows its
 * finished scene, the scroll rigs skip to their end state. Reading it through
 * `useSyncExternalStore` keeps it out of state-set-during-effect territory and
 * means a visitor toggling the OS setting is respected without a reload.
 *
 * The server snapshot is `false`: the server cannot know, and assuming full
 * motion matches what the CSS does before hydration.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mq = matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(QUERY).matches,
    () => false
  );
}
