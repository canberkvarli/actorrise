"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { IconQuestionMark } from "@tabler/icons-react";

import { useScripts } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Skeleton } from "@/components/ui/skeleton";

import { PracticeLibrary } from "@/components/practice/PracticeLibrary";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import { CallboardMarquee } from "@/components/community/CallboardMarquee";
import {
  HowItWorksWalkthrough,
  shouldAutoOpenWalkthrough,
} from "@/components/practice/HowItWorksWalkthrough";

/**
 * /practice — the page that opens after login.
 *
 * A two-pane library: pick a script on the left, see its scenes on the right,
 * open one in the editor to rehearse. Opens on the most-recent script (or the
 * demo for brand-new users).
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading } = useAuth();
  const { data: scripts, isLoading: scriptsLoading, isFetched: scriptsFetched } = useScripts();

  // The playbill walkthrough: introduces itself once, then lives behind (?).
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  useEffect(() => {
    if (user && shouldAutoOpenWalkthrough()) setWalkthroughOpen(true);
  }, [user]);

  const { demoScript, featuredScriptId, safeScripts, hasOwnScript } = useMemo(() => {
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
    return { demoScript, featuredScriptId, safeScripts, hasOwnScript: userScripts.length > 0 };
  }, [scripts]);

  const hasCachedData = scriptsFetched || safeScripts.length > 0;
  const isLoading = (authLoading && !user) || (scriptsLoading && !hasCachedData);

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div
      className={`container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${
        hasOwnScript ? "py-8 sm:py-14" : "py-6 sm:py-8"
      }`}
    >
      {isLoading ? (
        <div className="space-y-8 sm:space-y-10">
          <Skeleton className="h-12 w-3/4 max-w-md" />
          <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-10">
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
          className={hasOwnScript ? "space-y-8 sm:space-y-10" : "space-y-4"}
        >
          {/* Ambient activity stays at the very top, first visit or hundredth. */}
          <CallboardMarquee />

          {hasOwnScript ? (
            /* Screen identity — this is the rehearsal room, not just a list. */
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
                  (from the top.)
                </p>
                <h1 className="mt-1 font-brand text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  ScenePartner
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Bring in your sides and rehearse every other role with a partner
                  that holds your lines and never misses a cue.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HowItWorksButton onOpen={() => setWalkthroughOpen(true)} />
                <UploadScriptButton variant="primary">Upload a script</UploadScriptButton>
              </div>
            </header>
          ) : (
            /* First visit: the welcome screen below IS the identity and the CTA,
               so the header would only push it under the fold and offer a second
               Upload button. Just keep (?) reachable. */
            <div className="flex justify-end sm:-mb-9">
              <HowItWorksButton onOpen={() => setWalkthroughOpen(true)} />
            </div>
          )}

          <Suspense fallback={null}>
            <PracticeLibrary
              scripts={safeScripts}
              featuredScriptId={featuredScriptId}
              demoScriptId={demoScript?.id ?? null}
            />
          </Suspense>
        </motion.div>
      )}

      <HowItWorksWalkthrough open={walkthroughOpen} onOpenChange={setWalkthroughOpen} />
    </div>
  );
}

function HowItWorksButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="How ScenePartner works"
      title="How it works"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <IconQuestionMark className="h-4 w-4" />
    </button>
  );
}
