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
import { CallboardMarquee } from "@/components/community/CallboardMarquee";
import {
  HowItWorksWalkthrough,
  shouldAutoOpenWalkthrough,
} from "@/components/practice/HowItWorksWalkthrough";

/**
 * /practice — the page that opens after login.
 *
 * The rehearsal room. It opens on the work: the line you stopped on, or the
 * first line of a scene that is ready, set large enough to read from across the
 * desk. The shelf sits beside it and only takes over when you reach for a
 * script. See WhatsNext for the ladder that decides what the stage holds.
 */
export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading } = useAuth();
  const { data: scripts, isLoading: scriptsLoading, isFetched: scriptsFetched } = useScripts();

  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  const { demoScript, featuredScriptId, safeScripts, hasOwnScript } = useMemo(() => {
    const safeScripts = scripts ?? [];
    const userScripts = safeScripts.filter((s) => !s.is_sample);
    const demoScript = safeScripts.find((s) => s.is_sample) ?? null;
    // Most recently uploaded user script. No longer the default selection —
    // that FUTURE note about defaulting to the most recently *practiced* scene
    // is what the stage does now, from rehearsal_sessions. Kept only so a
    // deep-link with a stale id has somewhere sensible to fall back to.
    const featuredScriptId =
      [...userScripts].sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0]?.id ?? null;
    return { demoScript, featuredScriptId, safeScripts, hasOwnScript: userScripts.length > 0 };
  }, [scripts]);

  const hasCachedData = scriptsFetched || safeScripts.length > 0;
  const isLoading = (authLoading && !user) || (scriptsLoading && !hasCachedData);

  // The playbill walkthrough introduces itself to first-timers only, then lives
  // behind (?). Two gates, because either alone is wrong: the seen-flag is
  // per-browser, so an established actor signing in on a new device would get
  // pitched the basics; and "no scripts yet" alone would re-pitch on every visit
  // until they upload. Wait for the script list before deciding, or everyone
  // looks like a first-timer for the first second.
  useEffect(() => {
    if (!user || !scriptsFetched || hasOwnScript) return;
    if (shouldAutoOpenWalkthrough()) setWalkthroughOpen(true);
  }, [user, scriptsFetched, hasOwnScript]);

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

          {/* No title, no tagline.
              This used to read "ScenePartner" in Playfair over a paragraph
              explaining what ScenePartner is — landing-page copy sitting on the
              app's home screen, seen daily by people who already bought it, and
              a second Playfair title competing with the script's own. The stage
              below opens on a real line of dialogue, which says what this room
              is for far better than a sentence describing it. All that is left
              up here is the way in and the way to ask. */}
          <div className="flex items-center justify-end gap-2">
            <HowItWorksButton onOpen={() => setWalkthroughOpen(true)} />
          </div>

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
