"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
      {/* The caption sits under its title, not at the far edge of the
          column. `justify-between` threw it across a 560px gap, so the
          two shelves read as four unrelated things instead of two
          headings with subtitles. */}
      <div className="mb-5">
        <h2 className="t-shelf-title">
          Picked for <em>your type.</em>
        </h2>
        {profileFacts && (
          <p className="t-dir mt-1.5" style={{ fontSize: 12, color: "var(--t-muted-dark-2)" }}>
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


/**
 * The same shelf, before it can pick anything.
 *
 * This used to be a tinted rounded rectangle with a sparkle icon and an "Add
 * it →" link, written in the app's semantic tokens on a page that has been
 * Theatre Walk since the search rebuild — so the one thing asking for
 * something was the one thing that did not look like it belonged here. It now
 * carries the shelf's own heading, so the slot reads as this shelf waiting to
 * be filled rather than an ad sitting where results should be.
 */
function ProfileNudge({ onOpen }: { onOpen: () => void }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="t-shelf-title">
          Picked for <em>your type.</em>
        </h2>
        <p className="t-dir mt-1.5" style={{ fontSize: 12, color: "var(--t-muted-dark-2)" }}>
          (we haven&apos;t met properly.)
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onOpen}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2 }}
        className="flex w-full flex-col items-start gap-4 border-[1.5px] border-dashed p-5 text-left transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        style={{
          borderColor: "color-mix(in oklab, var(--t-text) 28%, transparent)",
          background: "var(--t-paper-2)",
          color: "var(--t-text)",
        }}
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-snug">
            Tell me how you&apos;re cast, and this shelf fills up.
          </span>
          <span className="mt-1 block text-sm leading-relaxed" style={{ color: "var(--t-muted-dark)" }}>
            Your playing age, your type, what you want to work on. Five taps, and
            every search after this one leans your way.
          </span>
        </span>
        <span
          className="inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-sm font-bold"
          style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
        >
          Set my type
          <span
            className="inline-flex size-8 items-center justify-center rounded-full"
            style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      </motion.button>
    </div>
  );
}

/** Placeholders in the shape the shelf actually loads into — a column of rows,
 *  not a three-up grid, which is what this drew until the shelf was rebuilt. */
function ForYouSkeleton() {
  return (
    <div>
      <div className="mb-5 h-6 w-52 animate-pulse" style={{ background: "var(--t-paper-2)" }} />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse" style={{ background: "var(--t-paper-2)" }} />
        ))}
      </div>
    </div>
  );
}
