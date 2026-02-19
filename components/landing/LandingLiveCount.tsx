"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";

const INITIAL_DURATION_MS = 2000;
const UPDATE_DURATION_MS = 1200;
const POLL_INTERVAL_MS = 25_000;

/**
 * Ease-out so the number slows as it approaches the target.
 */
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

type LandingLiveCountProps = {
  /** Inline variant for hero: compact, no section border */
  variant?: "section" | "inline";
};

/**
 * Fetches total_searches, animates from 0 to that value, then polls so the
 * number ticks up when new searches happen (feels live).
 */
type PublicStats = {
  total_searches: number;
  total_monologues?: number;
  total_film_tv_references?: number;
};

export function LandingLiveCount({ variant = "section" }: LandingLiveCountProps) {
  const [totalSearches, setTotalSearches] = useState<number | null>(null);
  const [libraryStats, setLibraryStats] = useState<{ monologues: number; filmTv: number } | null>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);
  const fromRef = useRef(0);

  const fetchStats = () => {
    const url = `${API_URL}/api/public/stats`;
    fetch(url, { method: "GET" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PublicStats | null) => {
        if (!data || typeof data.total_searches !== "number") return;
        setTotalSearches(data.total_searches);
        if (
          typeof data.total_monologues === "number" &&
          typeof data.total_film_tv_references === "number"
        ) {
          setLibraryStats({
            monologues: data.total_monologues,
            filmTv: data.total_film_tv_references,
          });
        }
      })
      .catch(() => {});
  };

  // Initial fetch + polling so the count updates when searches happen
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Refetch immediately when a demo search completes on the landing page (live update)
  useEffect(() => {
    const onRefresh = () => fetchStats();
    window.addEventListener("actorrise:stats-refresh", onRefresh);
    return () => window.removeEventListener("actorrise:stats-refresh", onRefresh);
  }, []);

  // Count-up animation: from current display to totalSearches (so it ticks up when we poll)
  useEffect(() => {
    if (totalSearches === null) return;

    const from = fromRef.current;
    const to = totalSearches;
    const isInitial = from === 0;
    const duration = isInitial ? INITIAL_DURATION_MS : UPDATE_DURATION_MS;

    if (to > from) setIsPulsing(true);
    const pulseTimeout = to > from ? window.setTimeout(() => setIsPulsing(false), 800) : undefined;

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const value = Math.round(from + eased * (to - from));
      setDisplayValue(value);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setDisplayValue(to);
        fromRef.current = to;
      }
    };

    requestAnimationFrame(tick);
    return () => {
      if (pulseTimeout) clearTimeout(pulseTimeout);
    };
  }, [totalSearches]);

  // Always show the block (even 0+) so the number is never "gone"; it updates when data loads or polls
  const valueToShow = totalSearches === null ? 0 : displayValue;
  const formatted = valueToShow.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const isInline = variant === "inline";

  const content = (
    <div className={isInline ? "" : "container mx-auto px-4 sm:px-6"}>
      <div
        className={
          isInline
            ? "flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-center sm:text-left"
            : "max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 text-center sm:text-left"
        }
      >
        {/* Main: monologues found */}
        <div className={isInline ? "flex-1 min-w-0" : "flex-1 min-w-0"}>
          <p className="text-xs sm:text-sm font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
            So far
          </p>
          <p
            className={
              isInline
                ? "text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight text-foreground"
                : "text-4xl sm:text-5xl md:text-5xl font-semibold tabular-nums tracking-tight text-foreground"
            }
          >
            <motion.span
              key={totalSearches ?? 0}
              initial={false}
              animate={{ scale: isPulsing ? 1.12 : 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
              }}
              className={`inline-block origin-center ${isPulsing ? "text-primary" : "text-foreground"}`}
            >
              {formatted}
            </motion.span>
            <span className="text-primary">+</span>
          </p>
          <p className={isInline ? "mt-1 text-muted-foreground text-sm" : "mt-1.5 text-muted-foreground text-base"}>
            monologues found by actors
          </p>
        </div>

        {/* Secondary: library size (value-prop style, smaller) */}
        {libraryStats && (
          <div
            className={
              isInline
                ? "pl-0 sm:pl-6 sm:border-l border-border/50 flex-1 min-w-0"
                : "pl-0 sm:pl-8 sm:border-l border-border/50 flex-1 min-w-0"
            }
          >
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
              Library
            </p>
            <p className={isInline ? "text-xl sm:text-2xl font-semibold tabular-nums text-foreground" : "text-2xl sm:text-3xl font-semibold tabular-nums text-foreground"}>
              {libraryStats.monologues.toLocaleString("en-US")}+ monologues
            </p>
            <p className={isInline ? "mt-0.5 text-muted-foreground text-sm" : "mt-1 text-muted-foreground text-sm"}>
              {libraryStats.filmTv.toLocaleString("en-US")}+ film & TV
            </p>
          </div>
        )}
      </div>
    </div>
  );

  if (isInline) {
    return (
      <div aria-label="Monologues found so far" className="pt-6">
        {content}
      </div>
    );
  }

  return (
    <section
      className="border-t border-border/60 py-14 md:py-20"
      aria-label="Monologues found so far"
    >
      {content}
    </section>
  );
}
