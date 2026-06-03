"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

import { useScripts } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/hooks/useDashboardData";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Skeleton } from "@/components/ui/skeleton";

import { PracticeGreeting } from "@/components/practice/PracticeGreeting";
import { PracticeScriptsGrid } from "@/components/practice/PracticeScriptsGrid";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

/**
 * /practice — the page that opens after login.
 *
 * Deliberately spare: a one-line greeting, then the script library as the hero.
 * The most recently used script is accented as the obvious "Resume" action.
 * No eyebrows, no explanatory paragraphs, no duplicated featured card.
 *
 * Layout:
 *  1. Greeting + Upload (Upload only shows once the user has scripts)
 *  2. Scripts grid (resume-accented recent script; demo pinned last; rich empty state)
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { data: scripts, isLoading: scriptsLoading, isFetched: scriptsFetched } = useScripts();
  const { data: profile } = useProfile(isDemoUser);

  const { userScripts, demoScript, featuredScriptId, safeScripts } = useMemo(() => {
    const safeScripts = scripts ?? [];
    const userScripts = safeScripts.filter((s) => !s.is_sample);
    const demoScript = safeScripts.find((s) => s.is_sample) ?? null;
    // Most recently uploaded user script. Backend returns scripts ordered DESC
    // by created_at, but we sort defensively to stay deterministic.
    // FUTURE: when recent-rehearsal data lands, swap this for the most recently
    // practiced *scene* and keep the "Resume" accent pointing at it.
    const featuredScriptId =
      [...userScripts].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0]?.id ?? null;
    return { userScripts, demoScript, featuredScriptId, safeScripts };
  }, [scripts]);

  // Render-as-soon-as-we-can: if we have ANY scripts data (from persisted cache
  // or a prior fetch) AND a user (cached or live), skip the skeleton entirely.
  const hasCachedData = scriptsFetched || safeScripts.length > 0;
  const isLoading = (authLoading && !user) || (scriptsLoading && !hasCachedData);
  const displayName = (profile?.name?.trim() || user?.name?.trim() || "") as string;
  const hasUserScripts = userScripts.length > 0;

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      {isLoading ? (
        <div className="space-y-8 sm:space-y-10">
          <Skeleton className="h-12 w-3/4 max-w-md" />
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
          className="space-y-8 sm:space-y-10"
        >
          <div className="flex items-center justify-between gap-4">
            <PracticeGreeting name={displayName} />
            {hasUserScripts && <UploadScriptButton variant="compact" />}
          </div>

          <PracticeScriptsGrid
            scripts={safeScripts}
            featuredScriptId={featuredScriptId}
            demoScriptId={demoScript?.id ?? null}
          />
        </motion.div>
      )}
    </div>
  );
}
