"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { useScripts } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Skeleton } from "@/components/ui/skeleton";

import { PracticeEmptyState } from "@/components/practice/PracticeEmptyState";
import { ProfileCompletionCard } from "@/components/practice/ProfileCompletionCard";
import { ContinuePracticingRow } from "@/components/practice/ContinuePracticingRow";
import { YourScriptsList } from "@/components/practice/YourScriptsList";

/**
 * /practice — adaptive landing page for ScenePartner.
 *
 * - 0 user scripts → PracticeEmptyState hero with upload + demo CTAs.
 * - ≥1 user script → ProfileCompletionCard + (future) ContinuePracticingRow + YourScriptsList.
 *
 * Auth + data fetching mirrors `/my-scripts` (useScripts via TanStack Query).
 * Upload flow lives on `/my-scripts` (hidden input + SSE stream + scan dialog).
 * Phase 2 routes the upload CTA there rather than duplicating that logic.
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { data: scripts = [], isLoading: scriptsLoading } = useScripts();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard, same pattern as /dashboard and /my-scripts
    setMounted(true);
  }, []);

  const { userScripts, demoScript } = useMemo(() => {
    const userScripts = scripts.filter((s) => !s.is_sample);
    const demoScript = scripts.find((s) => s.is_sample) ?? null;
    return { userScripts, demoScript };
  }, [scripts]);

  const isLoading = !mounted || authLoading || scriptsLoading;
  const hasOwnScripts = userScripts.length > 0;

  // Upload trigger lives on /my-scripts. Centralizing here would mean
  // duplicating ~150 lines of scan + SSE streaming logic. Phase 3 can extract
  // it into a shared hook/component if needed.
  const handleUploadClick = () => {
    router.push("/my-scripts");
  };

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-3xl">
      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-10 w-3/4 max-w-md" />
          <Skeleton className="h-5 w-1/2 max-w-sm" />
          <div className="space-y-3 pt-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : !user ? (
        // Should be handled by middleware/layout, but render a noop just in case.
        <div className="py-20 text-center text-muted-foreground text-sm">
          Please sign in to practice scenes.
        </div>
      ) : !hasOwnScripts ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <PracticeEmptyState
            demoScriptId={demoScript?.id ?? null}
            onUploadClick={handleUploadClick}
          />
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="space-y-8"
        >
          <ProfileCompletionCard />
          <ContinuePracticingRow />
          <YourScriptsList
            scripts={scripts}
            isLoading={false}
            onUploadClick={handleUploadClick}
          />
        </motion.div>
      )}
    </div>
  );
}
