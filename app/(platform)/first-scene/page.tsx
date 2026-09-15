"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LampSketch from "@/components/onboarding/LampSketch";

/**
 * /first-scene — the zero-setup first rehearsal.
 *
 * A brand-new actor is handed one piece and dropped straight into it. No
 * search, no saving, no setup: fetch one short monologue matched loosely to
 * their profile and hand off to /work. This is the move that targets the
 * 88.6%-search → 3.9%-rehearse activation cliff.
 *
 * It used to stop here and show a card — the title, the running time, a Start
 * button and a "find my own instead" link — and wait for a tap. That card was
 * a step that asked a question nobody had: the actor had just been promised a
 * piece to rehearse, and the answer to "do you want it?" is the reason they
 * are on this screen at all. A flow whose whole argument is "no setup" cannot
 * open with a setup screen. So the route is a router now: it resolves a piece
 * and goes.
 *
 * It also used to hand off to a curated two-hander from the scene library.
 * That library was deleted in the monologue-study pivot
 * (purge_library_scenes.py) and this screen was never repointed, so its
 * endpoint 404'd for all 265 eligible actors and the flow only ever ran its
 * bail-out path. Same intent, content that still exists.
 */

interface FirstPiece {
  monologue_id: number;
}

export default function FirstScenePage() {
  const router = useRouter();
  const { user, loading, refreshUser } = useAuth();
  const fetchedRef = useRef(false);
  const leftRef = useRef(false);

  // Mark the flow as seen so the gate never fires it again, regardless of how
  // the actor leaves (straight through, or no piece available).
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
      if (leftRef.current) return;
      leftRef.current = true;
      /* Navigate FIRST, mark seen behind it.
         This used to `await markSeen()` before navigating, so the actor sat on
         a full-screen spinner until a PATCH round-trip finished — measured at
         15-20s locally on the no-piece path, with nothing to read and no way
         out. The flag is a nicety; being stranded is not. */
      router.replace(href);
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

  // Resolve a piece and go straight into it.
  useEffect(() => {
    if (fetchedRef.current || loading || !user) return;
    fetchedRef.current = true;
    api
      .get<FirstPiece>("/api/monologues/first-rehearsal")
      .then(({ data }) => {
        if (!data?.monologue_id) {
          leaveTo("/monologues");
          return;
        }
        leaveTo(`/monologue/${data.monologue_id}/work`);
      })
      .catch(() => {
        // Nothing servable — hand them the search rather than trap them.
        leaveTo("/monologues");
      });
  }, [loading, user, leaveTo]);

  /**
   * Backstop: this is a full-bleed overlay with no navigation, so if anything
   * upstream stalls — a slow auth resolve, a request that never settles — the
   * actor has no way off it. Nothing here is worth more than a few seconds of
   * a brand-new user's patience.
   */
  useEffect(() => {
    const id = setTimeout(() => leaveTo("/practice"), 6000);
    return () => clearTimeout(id);
  }, [leaveTo]);

  /* One line while the piece resolves. Deliberately not a spinner and not a
     card: the actor is on their way somewhere, and this is the hallway. */
  return (
    <div className="t-first-scene" role="status" aria-live="polite">
      <LampSketch size={84} />
      <p className="t-first-scene__line">(finding you something to say.)</p>
    </div>
  );
}
