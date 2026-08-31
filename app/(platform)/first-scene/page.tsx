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
 * A focused interstitial that drops a brand-new actor straight into one curated
 * scene. No script upload, no character picker: we fetch a guaranteed-valid
 * casting from the backend, show a single "tap to start" card, then hand off to
 * the existing rehearsal page with a freshly-created session (the exact handoff
 * the practice editor already uses). This is the move that targets the
 * 88.6%-search → 3.9%-rehearse activation cliff.
 */

interface FirstScene {
  scene_id: number;
  user_character: string;
  ai_character: string;
  title: string;
  play_title?: string | null;
}

export default function FirstScenePage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const [scene, setScene] = useState<FirstScene | null>(null);
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
      .get<FirstScene>("/api/scenes/first-rehearsal")
      .then(({ data }) => setScene(data))
      .catch(() => {
        // No scene seeded in this environment — don't trap the user.
        leaveTo("/practice");
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

  const handleStart = useCallback(async () => {
    if (!scene || starting) return;
    setStarting(true);
    try {
      const { data } = await api.post<{ id: number } & Record<string, unknown>>(
        "/api/scenes/rehearse/start",
        { scene_id: scene.scene_id, user_character: scene.user_character },
      );
      // Cache so the rehearsal page skips the extra GET round-trip.
      try {
        sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data));
      } catch {
        /* quota — fine, page will GET instead */
      }
      // Mark seen but don't await the refresh; navigate immediately.
      void api
        .patch("/api/auth/onboarding", { has_seen_first_rehearsal: true })
        .catch(() => {});
      router.push(`/scenes/${scene.scene_id}/rehearse?session=${data.id}&firstRun=1`);
    } catch {
      // Couldn't start (rare) — send them to the scene library so they still
      // have a path forward, and don't loop them back here.
      setStarting(false);
      void leaveTo("/rehearse");
    }
  }, [scene, starting, router, leaveTo]);

  const ready = !loading && !!user && !!scene;

  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-neutral-950 px-5 text-neutral-100">
      {!ready ? (
        // Say something. A bare spinner on a full-bleed black overlay is
        // indistinguishable from a broken page, and this is the very first
        // screen after onboarding — the worst possible place to look dead.
        <div className="flex flex-col items-center gap-4 text-center">
          <IconLoader2 className="h-6 w-6 animate-spin text-neutral-500" />
          <p className="stage-direction text-xs text-neutral-500">
            (finding you a scene.)
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Your first scene
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-snug text-neutral-50">
            {scene!.title}
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-neutral-400">
            About 90 seconds. You play{" "}
            <span className="font-medium text-neutral-200">{scene!.user_character}</span>. I
            read{" "}
            <span className="font-medium text-neutral-200">{scene!.ai_character}</span> back to
            you, out loud. Speak your lines when it&apos;s your turn.
          </p>

          <Button
            onClick={handleStart}
            disabled={starting}
            className="mt-8 h-12 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {starting ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Tap to start"
            )}
          </Button>

          <button
            type="button"
            onClick={() => void leaveTo("/practice")}
            disabled={starting}
            className="mt-4 text-sm text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
