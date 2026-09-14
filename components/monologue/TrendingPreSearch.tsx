"use client";

import { motion } from "framer-motion";
import { useTrending } from "@/hooks/useTrending";
import { ShelfCard } from "@/components/monologue/ShelfCard";

/**
 * Pre-search filler for /monologues that actually helps: the pieces other
 * actors are working on right now. Task-serving (start a search from here) with
 * light social proof, replacing the raw activity feed that lived here before.
 */
export function TrendingPreSearch() {
  const { data, isLoading } = useTrending(6);

  if (isLoading) return <TrendingSkeleton />;
  // Array.isArray, not ?? : this shelf sits on the app's busiest page, and a
  // non-array payload (stale persisted cache, an error body) reaching .map
  // throws inside render and blanks the whole route.
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) return null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-shelf-title">
          Trending <em>this week.</em>
        </h2>
        <p className="t-dir" style={{ fontSize: 12, color: "var(--t-muted-dark-2)" }}>
          (what the house is working on.)
        </p>
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="flex flex-col gap-2.5"
      >
        {items.map((m) => (
          <motion.div
            key={m.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <ShelfCard m={m} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}


function TrendingSkeleton() {
  return (
    <div>
      <div className="mb-5 h-8 w-52 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
