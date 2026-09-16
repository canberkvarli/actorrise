"use client";

import { useAuth } from "@/lib/auth";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * The house, dark, before the first-run card arrives.
 *
 * OnboardingWizard is a dynamic() chunk with ssr:false, so it cannot render
 * until after hydration has fetched it. For the actor that meant watching the
 * dashboard assemble itself card by card, skeletons filling in, and then the
 * whole thing vanish under an onboarding takeover — the app introducing itself
 * twice, the second time contradicting the first.
 *
 * This is deliberately NOT dynamic and deliberately trivial: no framer, no
 * fonts to wait on, nothing but a filled rectangle in the flow's own page
 * colour. It costs a few bytes in the platform bundle and it holds the stage
 * until the real card lands on top of it.
 *
 * Only on `=== false`. While auth is loading the flag is undefined, and
 * covering the app on "not sure yet" would blank the screen for every returning
 * actor on every cold load.
 */
export function FirstRunCurtain() {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  if (user.has_completed_onboarding !== false) return null;

  return (
    <div
      aria-hidden
      className={`theatre-tokens theatre-onboarding ${theatreFontVars} fixed inset-0 z-[9999]`}
      style={{ background: "var(--page)" }}
    />
  );
}
