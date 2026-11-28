"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/events";

/** Pieces already counted in this tab, so scrolling back up and down is one read. */
const counted = new Set<string>();

/**
 * A sentinel under a piece's text: monologue_read_to_end when the end of the
 * text comes into view. A monologue_views row is an open (the detail page
 * loaded, and the wall may cover it), so it cannot say who read the piece.
 * Not drawn on a walled open. Seconds are from mount, so a two-second
 * "end" on a short piece is visible as such.
 */
export function ReadToEnd({ monologueId, surface }: { monologueId: number | string; surface: "page" | "panel" }) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(0);

  useEffect(() => {
    const el = ref.current;
    const key = `${surface}:${monologueId}`;
    if (!el || counted.has(key) || typeof IntersectionObserver === "undefined") return;
    mounted.current = Date.now();
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || counted.has(key)) return;
      counted.add(key);
      io.disconnect();
      trackEvent("monologue_read_to_end", {
        monologue_id: Number(monologueId) || null,
        surface,
        seconds: Math.round((Date.now() - mounted.current) / 1000),
      });
    });
    io.observe(el);
    return () => io.disconnect();
  }, [monologueId, surface]);

  return <div ref={ref} aria-hidden className="h-px w-full" />;
}
