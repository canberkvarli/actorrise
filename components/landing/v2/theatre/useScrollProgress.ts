"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Drives a sticky scroll rig from a rAF loop, and only while the rig is
 * actually on screen.
 *
 * Both the house reveal and the curtain are tall containers with a sticky
 * 100vh inner: progress is how far the container's top has travelled past the
 * viewport, 0 to 1. The value is written to CSS custom properties rather than
 * React state, so scrolling never re-renders anything.
 *
 * Under reduced motion the loop never starts and `apply` is called once with
 * 1 — the house reads fully lit and the curtain fully open, rather than a
 * blackout and a closed curtain frozen over the call to action.
 *
 * `apply` must be stable (wrap it in `useCallback` with an empty dep list);
 * it only ever touches refs, so there is nothing for it to close over.
 */
export function useScrollProgress(apply: (progress: number) => void) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (reduced) {
      apply(1);
      return;
    }

    let raf = 0;
    let running = false;

    const loop = () => {
      const r = el.getBoundingClientRect();
      const travel = r.height - window.innerHeight;
      const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
      apply(p);
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
        /* Leave the rig in its end state so a fast scroll past it doesn't
           strand the curtain half shut. */
        apply(entry.boundingClientRect.top < 0 ? 1 : 0);
      }
    });
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [apply, reduced]);

  return ref;
}
