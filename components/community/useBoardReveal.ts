"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The arrival replay.
 *
 * The Callboard sees roughly two real events an hour. Building "rows fly in as
 * they happen" against that traffic would have produced a page that sits
 * perfectly still for twenty minutes and then twitches once — motion that
 * proves how quiet the room is rather than hiding it.
 *
 * So the choreography is staged and the data is not. On arrival the board is
 * bare cork and the day gets pinned up in front of you over ~3.8s, in the order
 * a stage manager would post it. Every notice, name and number in that sequence
 * is a real event that really happened today; only the *timing* is theatre.
 *
 * Three rules keep it from becoming a toll booth:
 *
 *  - Once per browser session. sessionStorage, not localStorage: a returning
 *    actor tomorrow should get the show again, a person bouncing between
 *    /monologues and here should not.
 *  - Any scroll, click, key or touch snaps the whole board to settled.
 *  - prefers-reduced-motion skips straight to settled.
 */

const SEEN_KEY = "callboard:revealed";

export type RevealPhase = "pending" | "playing" | "settled";

/** Beat sheet, in seconds from the start of the replay. */
export const BEAT = {
  light: 0.0,
  stamp: 0.35,
  rule: 0.6,
  counts: 0.75,
  billing: 1.0,
  signin: 1.55,
  happening: 2.1,
  hunting: 2.6,
  also: 3.1,
  settle: 3.8,
} as const;

export function useBoardReveal(ready: boolean) {
  const [phase, setPhase] = useState<RevealPhase>("pending");
  const decided = useRef(false);

  // Decide once, the first time there is actually data to reveal. Deciding on
  // mount instead would burn the session flag while the board was still a
  // skeleton, and the actor would watch the show play to an empty room.
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Private mode / blocked storage: play it. A repeat show is a far
      // smaller failure than a board that never animates for anyone.
    }

    if (reduced || seen) {
      setPhase("settled");
      return;
    }

    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setPhase("playing");
  }, [ready]);

  const skip = useCallback(() => {
    setPhase((p) => (p === "playing" ? "settled" : p));
  }, []);

  // Settle on schedule, or early on any sign of impatience.
  useEffect(() => {
    if (phase !== "playing") return;

    const timer = window.setTimeout(() => setPhase("settled"), BEAT.settle * 1000);
    const opts = { passive: true, once: true } as const;
    const events: (keyof WindowEventMap)[] = [
      "wheel",
      "touchstart",
      "pointerdown",
      "keydown",
    ];
    events.forEach((e) => window.addEventListener(e, skip, opts));

    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, skip));
    };
  }, [phase, skip]);

  const playing = phase === "playing";

  /**
   * Turn a beat into a framer-motion transition.
   *
   * When the replay is not running this returns a zero-length transition rather
   * than `false`, so the same element markup can either perform or simply be
   * there. Skipping mid-flight lands here too: the targets never change, only
   * the duration collapses, so everything snaps to its settled pose instead of
   * unwinding.
   */
  const cue = useCallback(
    (at: number, extra?: { stagger?: number; index?: number }) => {
      if (!playing) return { duration: 0 };
      const stagger = (extra?.stagger ?? 0) * (extra?.index ?? 0);
      return {
        type: "spring" as const,
        stiffness: 210,
        damping: 19,
        mass: 0.9,
        delay: at + stagger,
      };
    },
    [playing]
  );

  return { phase, playing, settled: phase === "settled", cue, skip };
}
