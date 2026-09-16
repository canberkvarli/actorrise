"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import ProfileOnboardingFlow from "@/components/onboarding/ProfileOnboardingFlow";

/**
 * First-run gate for brand-new users. Shows the 5-tap profile onboarding to
 * users who have not completed onboarding. The flow defers refreshUser() until
 * it closes, so the client flag stays false and the gate stays open through the
 * payoff; `closed` guards against any re-open after they finish.
 */
export default function OnboardingWizard() {
  const { user, loading } = useAuth();
  const [closed, setClosed] = useState(false);

  const showing = !closed && !loading && !!user && user.has_completed_onboarding === false;

  // If this card is on screen, the actor is mid-onboarding, and FirstRehearsalGate
  // must not fire for the rest of the session — every exit from this card flips
  // has_completed_onboarding, which is the exact flag that gate watches. Latching
  // on MOUNT (not on close) means the claim is already in place before the card
  // can trigger the refresh that would race it. Account age is the durable half
  // of the same rule; this is the same-session half.
  useEffect(() => {
    if (!showing) return;
    try {
      sessionStorage.setItem("actorrise_first_scene_handled", "1");
    } catch {
      /* sessionStorage unavailable — the account-age check still covers it */
    }
  }, [showing]);

  /* Not an early `return null`: AnimatePresence has to stay mounted for the
     card it is holding to be allowed to leave. Returning null the instant
     `closed` flipped is what made finishing onboarding a hard cut to a black
     curtain — the flow was deleted mid-frame and its exit never ran. */
  return (
    <AnimatePresence>
      {showing && <ProfileOnboardingFlow variant="new" onClose={() => setClosed(true)} />}
    </AnimatePresence>
  );
}
