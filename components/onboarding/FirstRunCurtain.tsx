"use client";

import { useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { isSignupPending } from "@/lib/firstRun";

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
 * TWO conditions, because either alone leaves a gap:
 *
 *  - `has_completed_onboarding === false` covers a reload mid-onboarding, but
 *    NOT the seconds right after signup, where there is no user object yet and
 *    auth is still loading. Waiting for it is what still showed the dashboard
 *    for a beat.
 *  - the signup flag is known synchronously, before the platform's first
 *    render, and covers exactly that window. It is cleared the moment the
 *    server confirms onboarding is behind them.
 *
 * Read through useSyncExternalStore with a `false` server snapshot: it touches
 * sessionStorage, which the server cannot, and rendering the curtain during SSR
 * would black out the shell for everyone.
 */
export function FirstRunCurtain() {
  const { user } = useAuth();

  const signupPending = useSyncExternalStore(
    () => () => {},
    isSignupPending,
    () => false,
  );

  // The server saying "finished" always wins, so a returning actor is never
  // covered by a stale signup flag from earlier in the same tab.
  if (user?.has_completed_onboarding === true) return null;

  const needsOnboarding = user?.has_completed_onboarding === false;
  // Note auth's `loading` is deliberately NOT consulted: that window is the
  // gap being covered, not a reason to stand down.
  if (!needsOnboarding && !signupPending) return null;

  return (
    <div
      aria-hidden
      className={`theatre-tokens theatre-onboarding ${theatreFontVars} fixed inset-0 z-[9999]`}
      style={{ background: "var(--page)" }}
    />
  );
}
