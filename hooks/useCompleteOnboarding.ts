"use client";

import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";

export interface CompleteOnboardingInput {
  referral_source?: string;
}

/**
 * Marks the current user's onboarding as complete via PATCH /api/auth/onboarding.
 * No cache invalidation here — the caller should run refreshUser() afterwards so
 * the auth context flips user.has_completed_onboarding to true.
 */
export function useCompleteOnboarding() {
  return useMutation({
    mutationFn: async ({ referral_source }: CompleteOnboardingInput = {}) => {
      const trimmed = referral_source?.trim();
      const body = {
        has_completed_onboarding: true,
        // Also retire the legacy welcome modal so the two first-run experiences
        // don't stack for brand-new users.
        has_seen_welcome: true,
        ...(trimmed ? { referral_source: trimmed } : {}),
      };
      const res = await api.patch("/api/auth/onboarding", body);
      return res.data;
    },
  });
}

export default useCompleteOnboarding;
