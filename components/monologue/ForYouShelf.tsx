"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IconSparkles } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { ShelfCard } from "@/components/monologue/ShelfCard";
import { useProfileFormData } from "@/hooks/useDashboardData";
import ProfileOnboardingFlow from "@/components/onboarding/ProfileOnboardingFlow";

/**
 * Pre-search "Picked for your type" shelf on /monologues.
 *
 * The profile-based recommender already exists, but it was hidden behind the
 * "Find for me" button — so a user who searched once and left never felt the
 * personalization, and never had a reason to finish their profile. Profile-havers
 * rehearse ~1.6x more, so we surface the recommender BY DEFAULT and label it, and
 * when there is no profile yet the same slot recruits one. Self-contained like
 * TrendingPreSearch (navigates via Link, fetches its own data).
 */
export function ForYouShelf() {
  const queryClient = useQueryClient();
  /* The aside says what the shelf is picking on, in the actor's own profile
     terms. Nothing invented: whatever of the three is actually set is shown,
     and if none are, the aside is left off rather than filled with guesses. */
  const { data: profile } = useProfileFormData();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["for-you-shelf"],
    queryFn: async () => {
      const res = await api.get<Monologue[]>(
        "/api/monologues/recommendations?limit=6&fast=true",
      );
      return res.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const closeWizard = () => {
    setWizardOpen(false);
    // A profile may now exist — refresh the shelf and completion so the "Picked
    // for your type" payoff appears immediately without a reload.
    queryClient.invalidateQueries({ queryKey: ["for-you-shelf"] });
    queryClient.invalidateQueries({ queryKey: ["profile-stats"] });
  };

  // The recommender 400s when there is no profile yet. Turn the slot into a
  // one-line nudge that opens the quick 5-tap wizard (not the full form), so the
  // empty state itself recruits the 54% who never fill a profile — smoothly.
  const noProfile =
    isError &&
    /profile|complete your profile|actor profile not found/i.test(
      (error as Error)?.message ?? "",
    );
  if (noProfile) {
    return (
      <>
        <ProfileNudge onOpen={() => setWizardOpen(true)} />
        {wizardOpen && (
          <ProfileOnboardingFlow variant="backfill" onClose={closeWizard} />
        )}
      </>
    );
  }

  if (isLoading) return <ForYouSkeleton />;
  // Array.isArray, not ?? — see TrendingPreSearch: a non-array payload here
  // takes the whole /monologues route down at render time.
  const items = Array.isArray(data) ? data : [];
  if (isError || items.length === 0) return null;

  const profileFacts = [
    (profile as { gender?: string } | undefined)?.gender,
    (profile as { age_range?: string } | undefined)?.age_range,
    (profile as { preferred_tone?: string } | undefined)?.preferred_tone,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-shelf-title">
          Picked for <em>your type.</em>
        </h2>
        {profileFacts && (
          <p className="t-dir" style={{ fontSize: 12, color: "var(--t-muted-dark-2)" }}>
            ({profileFacts})
          </p>
        )}
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="flex flex-col gap-2.5"
      >
        {items.map((m) => (
          <motion.div
            key={m.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <ShelfCard m={m} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}


function ProfileNudge({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-8">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 text-left transition-all hover:border-primary/50"
      >
        <div className="flex items-start gap-2.5">
          <IconSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Add your type, get monologues picked for you
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A few quick taps, and every search gets tailored to you.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-primary">Add it →</span>
      </button>
    </div>
  );
}

function ForYouSkeleton() {
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-8">
      <div className="mb-4 h-4 w-44 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
