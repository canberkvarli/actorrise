"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import { useScripts } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useDashboardData";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Skeleton } from "@/components/ui/skeleton";

import { PracticeGreeting } from "@/components/practice/PracticeGreeting";
import { PracticeHeadlineCard } from "@/components/practice/PracticeHeadlineCard";
import { PracticeActivityBeats } from "@/components/practice/PracticeActivityBeats";
import { PracticeScriptsGrid } from "@/components/practice/PracticeScriptsGrid";

/**
 * /practice — editorial cinematic landing page for ScenePartner.
 *
 * Layout (top to bottom):
 *  1. Time-of-day greeting
 *  2. Headline card (adaptive: empty-state CTAs OR "where you left off" featured script)
 *  3. Activity beats (single quiet row; hidden when nothing to say)
 *  4. Scripts grid (visual 1 to 3 column layout; featured script excluded; demo pinned last)
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { data: scripts = [], isLoading: scriptsLoading } = useScripts();
  const { data: profile } = useProfile(isDemoUser);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard
    setMounted(true);
  }, []);

  const { userScripts, demoScript, featuredScript } = useMemo(() => {
    const userScripts = scripts.filter((s) => !s.is_sample);
    const demoScript = scripts.find((s) => s.is_sample) ?? null;
    // Most recently uploaded user script. Backend returns scripts ordered DESC
    // by created_at, but we sort defensively to stay deterministic.
    // FUTURE: when recent-rehearsal data lands, swap this for the most recently
    // practiced *scene* and rename the headline to "Pick up where you left off."
    const featuredScript =
      [...userScripts].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0] ?? null;
    return { userScripts, demoScript, featuredScript };
  }, [scripts]);

  const isLoading = !mounted || authLoading || scriptsLoading;
  const displayName = (profile?.name?.trim() || user?.name?.trim() || "") as string;

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      {isLoading ? (
        <div className="space-y-8 sm:space-y-10">
          <Skeleton className="h-12 w-3/4 max-w-md" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : !user ? (
        // Should be handled by middleware/layout, but render a noop just in case.
        <div className="py-20 text-center text-muted-foreground text-sm">
          Please sign in to practice scenes.
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="space-y-8 sm:space-y-12 lg:space-y-14"
        >
          <div className="space-y-3">
            <PracticeGreeting name={displayName} />
            <PracticeActivityBeats userScriptCount={userScripts.length} />
          </div>

          <PracticeHeadlineCard
            featuredScript={featuredScript}
            demoScriptId={demoScript?.id ?? null}
          />

          <PracticeScriptsGrid scripts={scripts} isLoading={false} />
        </motion.div>
      )}
    </div>
  );
}
