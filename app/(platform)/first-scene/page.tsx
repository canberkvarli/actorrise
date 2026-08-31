"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { IconLoader2 } from "@tabler/icons-react";

/**
 * /first-scene — the zero-setup first rehearsal intro.
 *
 * A focused interstitial that drops a brand-new actor straight into one piece.
 * No search, no saving, no setup: fetch one short monologue matched loosely to
 * their profile, show a single "tap to start" card, and hand off to /work. This
 * is the move that targets the 88.6%-search → 3.9%-rehearse activation cliff.
 *
 * It used to hand off to a curated two-hander from the scene library. That
 * library was deleted in the monologue-study pivot (purge_library_scenes.py)
 * and this screen was never repointed, so its endpoint 404'd for all 265
 * eligible actors and the flow only ever ran its bail-out path. Same intent,
 * content that still exists.
 */

interface FirstPiece {
  monologue_id: number;
  character_name: string;
  play_title?: string | null;
  author?: string | null;
  estimated_duration_seconds?: number | null;
}

export default function FirstScenePage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [scene, setScene] = useState<FirstPiece | null>(null);
  const [starting, setStarting] = useState(false);
  const fetchedRef = useRef(false);

  // Mark the flow as seen so the gate never fires it again, regardless of how
  // the user leaves (start, skip, or no scene available).
  const markSeen = useCallback(async () => {
    try {
      await api.patch("/api/auth/onboarding", { has_seen_first_rehearsal: true });
    } catch {
      /* non-fatal — worst case the gate retries next visit */
    }
    void refreshUser();
  }, [refreshUser]);

  const leaveTo = useCallback(
    (href: string) => {
      // Navigate FIRST, mark seen behind it.
      //
      // This used to `await markSeen()` before pushing, so the actor sat on a
      // full-screen spinner until a PATCH round-trip finished — measured at
      // 15-20s locally on the no-scene path, with nothing on screen to read and
      // no way out. The flag is a nicety (worst case the gate offers the flow
      // again); being stranded is not. The two are now independent.
      router.push(href);
      void markSeen();
    },
    [markSeen, router],
  );

  // Latch the per-session gate guard so the redirect can never bounce us back
  // here while the backend flag is still propagating through a throttled /me.
  useEffect(() => {
    try {
      sessionStorage.setItem("actorrise_first_scene_handled", "1");
    } catch {
      /* sessionStorage unavailable — backend flag still covers it */
    }
  }, []);

  // Defensive: anyone who already saw it or has rehearsed shouldn't be here.
  useEffect(() => {
    if (loading || !user) return;
    if (user.has_seen_first_rehearsal === true || user.has_ever_rehearsed === true) {
      router.replace("/practice");
    }
  }, [loading, user, router]);

  // Fetch the hero scene + casting.
  useEffect(() => {
    if (fetchedRef.current || loading || !user) return;
    fetchedRef.current = true;
    api
      .get<FirstPiece>("/api/monologues/first-rehearsal")
      .then(({ data }) => setScene(data))
      .catch(() => {
        // Nothing servable — don't trap the user.
        leaveTo("/monologues");
      });
  }, [loading, user, leaveTo]);

  /**
   * Backstop: this screen is a full-bleed overlay with no navigation, so if
   * anything upstream stalls — a slow auth resolve, a request that never
   * settles — the actor has no way off it at all. Nothing here is worth more
   * than a few seconds of a brand-new user's patience.
   */
  useEffect(() => {
    if (scene) return;
    const id = setTimeout(() => {
      if (!fetchedRef.current || !scene) leaveTo("/practice");
    }, 6000);
    return () => clearTimeout(id);
  }, [scene, leaveTo]);

  const handleStart = useCallback(() => {
    if (!scene || starting) return;
    setStarting(true);
    // No session to create: /work takes the monologue id and starts. The old
    // scene flow needed a POST first, which is why this used to be async.
    router.push(`/monologue/${scene.monologue_id}/work`);
    void markSeen();
  }, [scene, starting, router, markSeen]);

  const ready = !loading && !!user && !!scene;
  const secs = scene?.estimated_duration_seconds ?? 0;
  const mins = secs > 0 ? Math.max(1, Math.round(secs / 60)) : 0;

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-neutral-950 px-5 text-neutral-100">
      {!ready ? (
        // Say something. A bare spinner on a full-bleed black overlay is
        // indistinguishable from a broken page, and this is the very first
        // screen after onboarding — the worst possible place to look dead.
        <div className="flex flex-col items-center gap-4 text-center">
          <IconLoader2 className="h-6 w-6 animate-spin text-neutral-500" />
          <p className="stage-direction text-xs text-neutral-500">
            (finding you a piece.)
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md text-center">
          <p className="stage-direction text-xs text-neutral-500">
            (your first piece.)
          </p>
          <h1 className="font-typewriter mt-3 text-3xl font-semibold leading-tight text-neutral-50">
            {scene!.character_name}
          </h1>
          {scene!.play_title && (
            <p className="font-typewriter mt-1.5 text-sm text-neutral-400">
              {scene!.play_title}
              {scene!.author ? `, by ${scene!.author}` : ""}
            </p>
          )}
          <p className="mt-5 text-sm leading-relaxed text-neutral-400">
            {mins ? `About ${mins} minute${mins === 1 ? "" : "s"}. ` : ""}
            You read it out loud, I keep your place and follow along. Nothing to
            set up.
          </p>

          <Button
            onClick={handleStart}
            disabled={starting}
            className="mt-8 h-12 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {starting ? <IconLoader2 className="h-5 w-5 animate-spin" /> : "Start"}
          </Button>

          <button
            type="button"
            onClick={() => leaveTo("/monologues")}
            disabled={starting}
            className="mt-4 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline disabled:opacity-50"
          >
            Find my own instead
          </button>
        </div>
      )}
    </div>
  );
}
