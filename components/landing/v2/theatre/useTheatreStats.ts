"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import { useReducedMotion } from "./useReducedMotion";

/**
 * The three numbers in the House stats bar, from the real corpus.
 *
 * The design prototype animated the counter to 8,434 and captioned the library
 * "1,700+ plays" and "200+ actors". Those were placeholders: the live endpoint
 * reports roughly 3.3k searches, 2.1k plays and 978 actors. Nothing here is
 * hardcoded to a headline number — the fallbacks below only exist so the bar
 * never renders a 0 or a dash before the fetch lands, and every one of them is
 * rounded DOWN from a figure the API actually returned, so a stale fallback
 * understates rather than overclaims.
 */
type PublicStats = {
  total_searches: number;
  total_monologues?: number;
  total_plays?: number;
  total_users?: number;
};

const CACHE_KEY = "actorrise_public_stats_v1";
const COUNT_MS = 1800;

const FALLBACK: Required<PublicStats> = {
  total_searches: 3300,
  total_monologues: 19000,
  total_plays: 2100,
  total_users: 900,
};

function readCache(): PublicStats | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicStats) : null;
  } catch {
    return null;
  }
}

function writeCache(stats: PublicStats) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stats));
  } catch {
    /* private mode, quota, blocked site data — the bar still renders */
  }
}

/** Round down so a rounded claim is always one the data already supports. */
function floorTo(value: number, step: number) {
  return Math.floor(value / step) * step;
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export function useTheatreStats() {
  const barRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [shownSearches, setShownSearches] = useState<number | null>(null);
  const reduced = useReducedMotion();

  /* The latest known target, so the counter effect can read it without
     re-subscribing every time a poll lands. */
  const targetRef = useRef(FALLBACK.total_searches);
  const countedRef = useRef(false);

  /* Cache first, then network. Both arrive through the same promise chain,
     which keeps every setState out of the effect body — the cache read is a
     synchronous call but its result is delivered a microtask later, exactly
     like the fetch it is standing in for. */
  useEffect(() => {
    let alive = true;

    const accept = (data: PublicStats | null, fromNetwork: boolean) => {
      if (!alive || !data || typeof data.total_searches !== "number") return;
      if (fromNetwork) writeCache(data);
      setStats(data);
      targetRef.current = data.total_searches;
      /* If the count already finished, move the number rather than replay it. */
      if (countedRef.current) {
        setShownSearches((current) =>
          current === null || data.total_searches > current ? data.total_searches : current
        );
      }
    };

    Promise.resolve()
      .then(() => accept(readCache(), false))
      .then(() => fetch(`${API_URL}/api/public/stats`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicStats | null) => accept(data, true))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  /* The counter runs the first time the bar is 10% into the viewport, once.
     Under reduced motion it lands on the final value with no ramp. */
  useEffect(() => {
    const el = barRef.current;
    if (!el || countedRef.current) return;

    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      countedRef.current = true;

      const target = targetRef.current;
      if (reduced) {
        setShownSearches(target);
        return;
      }
      const from = Math.round(target * 0.18);
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / COUNT_MS);
        setShownSearches(Math.round(from + easeOutQuart(p) * (target - from)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const monologues = stats?.total_monologues ?? FALLBACK.total_monologues;
  const plays = stats?.total_plays ?? FALLBACK.total_plays;
  const users = stats?.total_users ?? FALLBACK.total_users;

  /* Before the bar scrolls into view it shows the ramp's starting value, not a
     zero — the number is meant to read as a tally that is already running. */
  const searches =
    shownSearches ?? Math.round((stats?.total_searches ?? FALLBACK.total_searches) * 0.18);

  return {
    barRef,
    /** Live, animated. "monologues found by actors, so far" */
    searches: searches.toLocaleString("en-US"),
    /** "19,000+" — floored to the thousand. */
    monologues: floorTo(monologues, 1000).toLocaleString("en-US"),
    /** "2,100+" — floored to the hundred, for the marquee caption. */
    plays: floorTo(plays, 100).toLocaleString("en-US"),
    /** "900+" — floored to the hundred. */
    users: floorTo(users, 100).toLocaleString("en-US"),
  };
}
