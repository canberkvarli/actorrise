"use client";

import { useState } from "react";
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

  if (closed || loading || !user || user.has_completed_onboarding !== false) {
    return null;
  }

  return <ProfileOnboardingFlow variant="new" onClose={() => setClosed(true)} />;
}
