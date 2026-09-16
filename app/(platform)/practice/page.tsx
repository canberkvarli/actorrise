"use client";

import { Suspense, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";

import { useScripts } from "@/hooks/useScripts";
import { useAuth } from "@/lib/auth";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";
import { Skeleton } from "@/components/ui/skeleton";

import { PracticeLibrary } from "@/components/practice/PracticeLibrary";
import { theatreFontVars } from "@/lib/fonts/theatre";
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
/** The room's shape, held while the scripts resolve. */
function LibrarySkeleton() {
  return (
    <div aria-hidden className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12">
      <div>
        <Skeleton className="h-4 w-56 opacity-40" />
        <Skeleton className="mt-4 h-24 w-full max-w-2xl opacity-40" />
        <Skeleton className="mt-10 h-4 w-24 opacity-40" />
        <Skeleton className="mt-3 h-6 w-80 max-w-full opacity-40" />
        <Skeleton className="mt-10 h-16 w-48 rounded-full opacity-40" />
      </div>
      <div>
        <Skeleton className="h-4 w-32 opacity-40" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-[14px] opacity-40" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PracticePage() {
  // Hooks must run on every render — call before any feature-flag early return.
  const { user, loading: authLoading } = useAuth();
  const { data: scripts, isLoading: scriptsLoading, isFetched: scriptsFetched } = useScripts();

  /* Whether this browser has been shown the playbill. Read through
     useSyncExternalStore rather than an effect: it touches localStorage, which
     the server cannot, and `false` is the honest pre-hydration answer. */
  const unseen = useSyncExternalStore(
    () => () => {},
    shouldAutoOpenWalkthrough,
    () => false,
  );
  /* null = nobody has opened or dismissed it yet, so the data decides. */
  const [walkthroughOverride, setWalkthroughOverride] = useState<boolean | null>(null);

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

  // The playbill introduces itself to first-timers only, then lives behind (?).
  // Two gates, because either alone is wrong: the seen-flag is per-browser, so
  // an established actor signing in on a new device would get pitched the
  // basics; and "no scripts yet" alone would re-pitch on every visit until they
  // upload. Waiting for scriptsFetched is what stops everyone looking like a
  // first-timer for the first second.
  //
  // Derived rather than fired from an effect, so opening it is not a second
  // render pass — and once the actor opens or dismisses it themselves, the
  // override wins for the rest of the visit.
  //
  // THIRD gate, added 2026-09-16: onboarding must be finished. This room is
  // where the first-run card is shown, and both of these are modals — so a
  // brand-new actor could have the playbill open itself underneath the
  // onboarding card and meet two introductions at once. This is the ScenePartner
  // tour; it does not need a spotlight tour of its own on top of it.
  const walkthroughOpen =
    walkthroughOverride ??
    (!!user &&
      user.has_completed_onboarding === true &&
      scriptsFetched &&
      !hasOwnScript &&
      unseen);

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div
      className={`theatre-tokens theatre-stage ${theatreFontVars} container relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 ${
        hasOwnScript ? "py-8 sm:py-14" : "py-6 sm:py-8"
      } pb-28 sm:pb-24`}
    >
      {/* The room it is lit from: a warm wash off the top-left corner, a gel
          bloom in the far one, and the grain the hero uses. Fixed, so the
          light belongs to the room rather than scrolling with the content. */}
      <div aria-hidden className="t-stage-wash" />
      <div aria-hidden className="t-stage-grain" />

      {/* The ghost light used to hang here. It is gone from this screen.
          A ghost light means an empty house — it is the lamp left burning when
          nobody is working — and this is the one room that is never empty: it
          opens on a line someone stopped on. It also occupied the top-right
          column, which is where the shelf and the help mark live, so it spent
          the whole rollout being shoved around by the content it was hiding.
          It stays on the screens it means something on. */}

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

          {/* No title, no tagline.
              This used to read "ScenePartner" in Playfair over a paragraph
              explaining what ScenePartner is — landing-page copy sitting on the
              app's home screen, seen daily by people who already bought it, and
              a second Playfair title competing with the script's own. The stage
              below opens on a real line of dialogue, which says what this room
              is for far better than a sentence describing it. All that is left
              up here is the way in and the way to ask. */}

          {/* Dropped clear of the ghost light. The lamp hangs from the top of
              the room on the right, which is exactly where the shelf began —
              so the bulb it is lit by was stuck behind the first card, and the
              one piece of the room that says "this is a theatre" was the one
              piece you could not see. */}
          {/* Shaped like what is coming, not null. A null fallback means the
              whole two-column room appears out of nothing the instant its
              data resolves, which after a login — a full document load — is
              the jump that makes the landing feel broken. */}
          <Suspense fallback={<LibrarySkeleton />}>
            <PracticeLibrary
              scripts={safeScripts}
              featuredScriptId={featuredScriptId}
              demoScriptId={demoScript?.id ?? null}
              onHowItWorks={() => setWalkthroughOverride(true)}
            />
          </Suspense>

        </motion.div>
      )}

      {/* A callboard is a board on a wall: it stays put and you glance at it.
          Docked to the foot of the window rather than sitting in the document,
          where it was either the first thing the room said (top) or a thing you
          only met by scrolling past your own work (bottom). */}
      <div className="t-callboard-dock">
        <CallboardMarquee />
      </div>

      <HowItWorksWalkthrough open={walkthroughOpen} onOpenChange={setWalkthroughOverride} />
    </div>
  );
}
