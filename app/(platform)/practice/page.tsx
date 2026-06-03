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
import { PracticeLibrary } from "@/components/practice/PracticeLibrary";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";

/**
 * /practice — the page that opens after login.
 *
 * A one-line greeting over a two-pane library: pick a script on the left, see
 * its scenes on the right, and rehearse a scene in one place. Opens on the
 * most-recent script (or the demo for brand-new users).
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading, isDemoUser } = useAuth();
  const { data: scripts, isLoading: scriptsLoading, isFetched: scriptsFetched } = useScripts();
  const { data: profile } = useProfile(isDemoUser);

  const { demoScript, featuredScriptId, safeScripts } = useMemo(() => {
    const safeScripts = scripts ?? [];
    const userScripts = safeScripts.filter((s) => !s.is_sample);
    const demoScript = safeScripts.find((s) => s.is_sample) ?? null;
    // Most recently uploaded user script — the default selection.
    // FUTURE: when recent-rehearsal data lands, default to the most recently
    // practiced *scene* instead.
    const featuredScriptId =
      [...userScripts].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0]?.id ?? null;
    return { demoScript, featuredScriptId, safeScripts };
  }, [scripts]);

  const hasCachedData = scriptsFetched || safeScripts.length > 0;
  const isLoading = (authLoading && !user) || (scriptsLoading && !hasCachedData);
  const displayName = (profile?.name?.trim() || user?.name?.trim() || "") as string;
  const hasAnyScript = safeScripts.length > 0;

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      {isLoading ? (
        <div className="space-y-8 sm:space-y-10">
          <Skeleton className="h-12 w-3/4 max-w-md" />
          <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:gap-10">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-9 w-1/2 mb-4" />
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
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
            {hasAnyScript && <UploadScriptButton variant="compact" />}
          </div>

          <PracticeLibrary
            scripts={safeScripts}
            featuredScriptId={featuredScriptId}
            demoScriptId={demoScript?.id ?? null}
          />
        </motion.div>
      )}
    </div>
  );
}
