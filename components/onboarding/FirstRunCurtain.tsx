"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { onboardingIsQuietOn } from "@/lib/onboarding-routes";
import { theatreFontVars } from "@/lib/fonts/theatre";
import {
  isOnboardingDoneThisSession,
  isSignupPending,
  subscribeFirstRun,
} from "@/lib/firstRun";

/**
 * The house, dark, from the instant an account exists until the first-run card
 * is done with it.
 *
 * OnboardingWizard is a dynamic() chunk with ssr:false, so it cannot render
 * until hydration has fetched it. For the actor that meant watching the
 * dashboard assemble itself card by card, skeletons filling in, and then the
 * whole thing vanish under an onboarding takeover — the app introducing itself
 * twice, the second time contradicting the first.
 *
 * THREE conditions, because any one alone leaves a gap:
 *
 *  - `has_completed_onboarding === false` covers a reload mid-onboarding, but
 *    NOT the seconds right after signup, where there is no user object yet and
 *    auth is still loading. Waiting for it is what still showed the dashboard
 *    for a beat.
 *  - the signup flag is known synchronously, before the platform's first
 *    render, and covers exactly that window. It is cleared the moment the
 *    onboarding card is done.
 *  - the session latch lifts the curtain on the way OUT. The server flag is
 *    written and re-read asynchronously, so `user` still said
 *    has_completed_onboarding === false for as long as that round trip took —
 *    and this curtain sat over the app, opaque and motionless, as the last
 *    thing a brand-new account saw of their first session.
 *
 * Read through useSyncExternalStore with a `false` server snapshot: it touches
 * sessionStorage, which the server cannot, and rendering the curtain during SSR
 * would black out the shell for everyone. The subscribe is real (see
 * lib/firstRun) — sessionStorage fires no event in the tab that wrote it, so
 * without it the curtain never hears that it can go.
 */
export function FirstRunCurtain() {
  const { user } = useAuth();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const signupPending = useSyncExternalStore(subscribeFirstRun, isSignupPending, () => false);
  const onboardingDone = useSyncExternalStore(
    subscribeFirstRun,
    isOnboardingDoneThisSession,
    () => false,
  );

  // The server saying "finished" always wins, so a returning actor is never
  // covered by a stale signup flag from earlier in the same tab. The latch says
  // the same thing a round trip earlier.
  const finished = user?.has_completed_onboarding === true || onboardingDone;
  const needsOnboarding = user?.has_completed_onboarding === false;
  // Note auth's `loading` is deliberately NOT consulted: that window is the
  // gap being covered, not a reason to stand down.
  // Where the card stays quiet the curtain must too, or it sits over the
  // ScenePartner hub waiting for a card that never comes (2026-09-26: a
  // brand-new account saw a black /practice).
  const show = !finished && !onboardingIsQuietOn(pathname) && (needsOnboarding || signupPending);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="first-run-curtain"
          aria-hidden
          className={`theatre-tokens theatre-onboarding ${theatreFontVars} fixed inset-0 z-[9999]`}
          style={{ background: "var(--page)" }}
          initial={false}
          /* No enter: this is the curtain that is already down when the lights
             go out. Only the lift is animated, and it is the house coming up
             under the card leaving above it — 0.5s against the card's 0.42s,
             so the room is revealed rather than dropped on you. */
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
