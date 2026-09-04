"use client";

import { useEffect, useState } from "react";

import { API_URL } from "@/lib/api";

/**
 * How big the library actually is, asked rather than remembered.
 *
 * The count was hardcoded as 8,500 in twenty-two files and had drifted more
 * than five thousand pieces behind the truth. Every hardcoded count is a number
 * that was correct once; this library grows every week, so anything on screen
 * that can ask should.
 *
 * Reads `LandingLiveCount`'s cache first — that component runs on the same page
 * and writes this key, so the figure is usually there on first paint — then
 * refreshes from the network behind it.
 *
 * Returns null until something answers, deliberately. Callers render a phrase
 * that reads properly without a number rather than a zero, a dash or a skeleton,
 * so a slow or dead stats endpoint costs nothing. Never throws, never blocks.
 *
 * The null-first shape also keeps server and first client render identical, so
 * there is no hydration mismatch to chase.
 */

const STATS_CACHE_KEY = "actorrise_public_stats_v1";

export type LibraryStats = {
  monologues: number | null;
  plays: number | null;
};

type PublicStats = {
  total_monologues?: number;
  total_plays?: number;
};

function positive(n: unknown): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

export function useLibraryStats(): LibraryStats {
  const [stats, setStats] = useState<LibraryStats>({ monologues: null, plays: null });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STATS_CACHE_KEY);
      const cached = raw ? (JSON.parse(raw) as PublicStats) : null;
      if (cached) {
        const next = {
          monologues: positive(cached.total_monologues),
          plays: positive(cached.total_plays),
        };
        if (next.monologues || next.plays) setStats(next);
      }
    } catch {
      /* an unreadable cache just means waiting for the network */
    }

    let alive = true;
    fetch(`${API_URL}/api/public/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicStats | null) => {
        if (!alive || !d) return;
        const next = {
          monologues: positive(d.total_monologues),
          plays: positive(d.total_plays),
        };
        if (next.monologues || next.plays) setStats(next);
      })
      .catch(() => {
        /* the page must never depend on a stats endpoint being up */
      });

    return () => {
      alive = false;
    };
  }, []);

  return stats;
}
